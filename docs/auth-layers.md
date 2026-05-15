# Authorization Layers

There are 4 layers of authz in this template. Skipping any of layers 1–3 makes the app feel broken. Skipping layer 4 makes it unsafe.

A layer is "feel broken" when its failure produces a bad UX but no data leak: an unauthenticated page flashes before redirect, a stale subscription banner lingers, a button doesn't disable in time. A layer is "unsafe" when its failure lets a caller mutate or read data they shouldn't. Only Layer 4 is in the second category; that's why it's non-negotiable and the other three are judgement calls.

| Layer | Job | Where it lives in this repo | Cost of failure |
|---|---|---|---|
| 1. Edge / proxy | Coarse "is there a session" check on every request | `proxy.ts` (WorkOS `authkitProxy`) | Unauthenticated users hit authed routes; full page render before client realizes it |
| 2. Server route / layout | Per-route precondition (e.g. onboarded, has org) decided server-side | `app/dashboard/layout.tsx` (`fetchAuthedQuery` + `redirect`) | Flash of wrong content; "check on every page" maintenance burden |
| 3. Reactive client state | Mid-session permission changes reflected without reload | **Not enforced in this template** (see below) | Stale UI after subscription cancel / role downgrade in another tab |
| 4. Convex handler | Identity + input validation inside every mutation/query | `convex/users.ts` (`ctx.auth.getUserIdentity()` + `profileFormSchema.parse`) | Data loss or unauthorized writes; the only layer that actually protects data |

## Layer 1 — Edge / proxy

`proxy.ts` exports `authkitProxy()` from `@workos-inc/authkit-nextjs` with a matcher that runs on everything except Next static assets. WorkOS checks the session cookie and refreshes the access token if needed before any route handler executes.

This is **coarse**. It answers "is there *any* session?" — not "is this user allowed *this* resource?". It also doesn't redirect un-onboarded users, doesn't enforce org membership, and isn't aware of Convex data. That's intentional: the proxy runs on every request and should stay cheap.

Failure mode: if the proxy misfires, unauthenticated users reach authed pages and the components inside fall back on their own checks (Layer 2 / Layer 4). Nothing leaks, but everything feels janky.

## Layer 2 — Server route / layout

`app/dashboard/layout.tsx` runs server-side on every dashboard request. It calls `withAuth()` to read the WorkOS user, then `fetchAuthedQuery(api.users.getMe, {})` to look up the Convex row, and redirects to `/onboarding` if `displayName` is missing. The redirect happens **before any dashboard markup ships**, so there is no flash.

The helper that makes this safe is `lib/convex-server.ts:fetchAuthedQuery` — it pulls the access token from `withAuth()` and pushes it onto a fresh `ConvexHttpClient` so the query runs as the authenticated user. Plain `client.query()` without `setAuth` would run unauthenticated and `getMe` would return `null` for a perfectly valid user.

The maintenance burden: every authed route segment that has a precondition needs its own check. There is no single source of truth — each `layout.tsx` or `page.tsx` makes its own decision. Catch this by colocating preconditions in the highest shared layout.

Failure mode: forgetting Layer 2 on a new route means the user sees the page briefly (or fully) before Layer 4 rejects their data fetch. Bad UX; no data leak.

## Layer 3 — Reactive client state

**This template does not enforce Layer 3.** It earns its keep in apps where permissions can change mid-session without a navigation: a subscription cancelled in another tab, a role revoked by an admin, a feature flag flipped server-side.

The idiomatic Convex mechanism is `useQuery`: a query that returns the user's current permission state is reactive — when the underlying row changes, every subscriber re-renders. A typical pattern:

```tsx
const access = useQuery(api.access.forCurrentUser);
if (access === null) return <SignedOutFallback />;
if (!access.canUseFeature) return <Upsell />;
```

The "fallback" components are not security — they're UX. The data they would otherwise show must still be protected by Layer 4.

The yellow box in `app/dashboard/dashboard-client.tsx` is a *partial* Layer-3 example: it reacts to `getMe` transitions (returns `null` while the WorkOS webhook hasn't fired yet) and renders a diagnostic banner. It's reactive, but it's diagnostic UX, not authz enforcement — there is no permission change being checked, just a sync delay.

Failure mode: without Layer 3, the user keeps seeing premium UI for the rest of the session even after their subscription ends. Layer 4 still rejects the data they try to read or write, so nothing leaks; the screen just lies.

## Layer 4 — Convex handlers

Every mutation and query in `convex/users.ts` starts with:

```ts
const identity = await ctx.auth.getUserIdentity();
if (!identity) throw new Error('Not authenticated');
```

For mutations that accept user input, the next line is:

```ts
const parsed = profileFormSchema.parse(args);
```

`profileFormSchema` is the same Zod schema the React Hook Form `zodResolver` uses on the client (`convex/schemas/profile.ts`). Re-running `parse` server-side is what makes it safe to trust the validated shape further down the handler.

Two mutation shapes worth remembering:

- `completeOnboarding` is an **upsert**: inserts a `users` row if none exists, patches it if one does. Use it from `/onboarding`.
- `updateProfile` is a **patch-only**: throws "User row not found" if the row is missing. Use it from `/dashboard/settings`, which is gated by Layer 2 and so always runs after the row exists.

This is the **only** layer that protects data. A client-side `disabled` attribute, a hidden button, a Layer-3 reactive redirect — none of them stop a determined caller from opening DevTools and invoking the mutation directly. To prove it: open React DevTools on `/dashboard/settings`, select the settings component, find the `useMutation(api.users.updateProfile)` return value in the hook list, "Store as global variable," then in the console call `await $reactTemp1({ displayName: '', bio: '' })`. The promise rejects with a `ZodError` thrown from `profileFormSchema.parse` inside the handler — the client form is fully bypassed and the server still rejects.

Failure mode: a handler without `getUserIdentity()` or without `parse()` is a data leak waiting for someone with the browser console open.

## What gets shipped in this template

| Layer | Concrete location |
|---|---|
| 1 | `proxy.ts` |
| 2 | `app/dashboard/layout.tsx` (and `lib/convex-server.ts:fetchAuthedQuery`) |
| 3 | Not enforced. Diagnostic-only example in `app/dashboard/dashboard-client.tsx` (yellow box reacts to `getMe`) and `app/dashboard/bridge-error-boundary.tsx` (red box catches `whoami` throws). |
| 4 | `convex/users.ts` — `whoami`, `getMe`, `getByAuthId`, `completeOnboarding`, `updateProfile`. The two mutations both call `getUserIdentity()` and `profileFormSchema.parse()`. |

When you add a new authed feature, the discipline is: Layer 1 is already covered; pick the right layout for Layer 2; decide whether Layer 3 is worth the wiring; and **never skip Layer 4**.
