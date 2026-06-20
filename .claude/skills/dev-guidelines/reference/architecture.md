# Architecture

## The 4-layer authorization model

Authoritative source: `docs/auth-layers.md`.

| Layer | Job | Where | Failure cost |
|---|---|---|---|
| 1. Edge / proxy | Coarse "is there a session" on every request | `proxy.ts` | Unauthenticated user briefly sees an authed route. UX only. |
| 2. Server route / layout | Per-route precondition (signed in, onboarded, org member) decided server-side | `app/<route>/layout.tsx` + `lib/convex-server.ts` (`fetchAuthedQuery`) | Flash of wrong content. UX only. |
| 3. Reactive client state | Mid-session permission change reflected without reload | Diagnostic example only; not required | Stale UI. UX only. |
| 4. Convex handler | `getUserIdentity()` + `parseOrThrow` inside every mutation / query | Every file in `convex/<domain>.ts` | **Data leak.** Non-negotiable. |

Only Layer 4 protects data. Skipping any other layer is a UX bug; skipping Layer 4 is a security bug.

## Convex is the only backend

| Use Convex when | Use a Next.js route handler when |
|---|---|
| Reading or writing app data | Health endpoint (`app/healthz/route.ts`) |
| Server-side validation of user input | WorkOS auth callback (`app/auth/callback/route.ts`) |
| Side effects (email, payments API, AI calls) — use a Convex `action` | WorkOS sign-in / sign-up redirects (`app/auth/sign-in/route.ts`, `app/auth/sign-up/route.ts`) |
| Receiving a webhook — use an `httpAction` registered in `convex/http.ts` | (none other) |

No `app/api/*` for business logic. If you need a "Next API route," write a Convex `httpAction` instead.

## Module boundaries

```
proxy.ts                ← Layer 1
app/<route>/layout.tsx  ← Layer 2 server gates; `withAuth` + `fetchAuthedQuery`
app/<route>/page.tsx    ← Server Component default; switch to 'use client' for interactivity
app/<route>/*.tsx       ← Client components live next to their page
convex/<domain>.ts      ← Layer 4: queries, mutations, actions, httpActions
convex/schemas/*.ts     ← Zod schemas shared by client + server
convex/auth.ts          ← AuthKit events (user.created/updated/deleted)
convex/http.ts          ← HTTP router; registerRoutes for WorkOS webhook + custom routes
components/             ← Reusable React components
components/ui/          ← shadcn primitives (Button, Input, Form, Label, Textarea, ...)
stores/                 ← Zustand stores; one file per concern
lib/                    ← Server-only helpers (server-only.ts) and pure utilities
__tests__/              ← Vitest (jsdom)
e2e/                    ← Playwright
deploy/                 ← Dockerfile, deploy.sh, .env.deploy
```

## Where to put a new feature

1. Read or write user data → `convex/<feature>.ts` + Zod schema in `convex/schemas/<feature>.ts`.
2. New authed UI surface → add a folder under `app/` with `layout.tsx` (if it needs its own gate) and `page.tsx`.
3. New shared component → `components/<name>.tsx`; if it's a primitive variant, `components/ui/<name>.tsx`.
4. New side effect (email, payment, LLM) → Convex `action`. Triggered from a mutation via `ctx.scheduler.runAfter(0, internal.<feature>.<fn>, args)`.
5. New webhook receiver → `convex/<provider>.ts` exporting an `httpAction`, registered in `convex/http.ts` next to `authKit.registerRoutes(http)`.
6. File upload → presigned URL from Convex `'use node'` action (`convex/r2.ts`). Client uploads direct to R2 via `lib/r2/upload.ts` (`useR2Upload` hook), then stores the returned key via a separate mutation. Bucket CORS must allow PUT from the app origin.

## SoC reminders

- `proxy.ts` decides "is there a session." Nothing else. Don't read DB rows there.
- `layout.tsx` decides "is this user allowed here." It can read DB rows via `fetchAuthedQuery`.
- `page.tsx` (server) decides "what to render." Pure render.
- Client components decide "how to interact." No data validation logic; defer to the Zod schema.
- Convex handlers decide "is this operation valid for this user with these args." Always `getUserIdentity()` + `parseOrThrow` first; throw `ConvexError`, never `new Error`.

## Error handling

React error boundaries must be class components — the hook API doesn't expose error catching. Use them sparingly: only where a *diagnostic* throw needs to surface as actionable UI (e.g. a query that intentionally throws when the JWT bridge is broken).

### Sentry-wired root boundary

`app/global-error.tsx` is the App Router root error boundary. It is wired to Sentry — uncaught errors that bubble past every other boundary land there and are sent to Sentry via `Sentry.captureException`. It replaces the root layout when it renders, so it must include `<html><body>`.

Do NOT remove or replace `app/global-error.tsx`. Per-component class boundaries (below) remain the way to show actionable diagnostic UI for known-failure surfaces.

### Canonical class boundary

A diagnostic boundary catches **every** throw under it, but the diagnostic only fits one failure mode. It MUST discriminate: regex-test the error for that mode, show the diagnostic only on a match, and fall back to a generic panel otherwise. Rendering the diagnostic for every throw (a bad query arg, a render bug) is misleading — this was a real bug. Canonical source: `app/dashboard/bridge-error-boundary.tsx`.

```tsx
'use client';

import { Component, type ReactNode } from 'react';
import { errorMessage } from '@/convex/lib/errorMessage';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class BridgeErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override render() {
    const { error } = this.state;
    if (error) {
      const isBridgeError =
        /not authenticated|no identity|unauthenticated|identity|auth/i.test(
          `${error.name} ${error.message}`,
        );
      if (!isBridgeError) {
        return (
          <div role="alert" className="rounded border border-border p-4">
            <p className="font-semibold">Something went wrong</p>
            <p className="text-muted-foreground">Reload the page to try again.</p>
          </div>
        );
      }
      return (
        <div role="alert" className="rounded border border-red-400 p-4">
          <p className="font-semibold">WorkOS→Convex bridge is broken</p>
          <p>Check <code>convex/auth.config.ts</code> is deployed and{' '}
            <code>WORKOS_CLIENT_ID</code> (via <code>npx convex env set</code>)
            matches <code>NEXT_PUBLIC_WORKOS_CLIENT_ID</code> in <code>.env.local</code>.</p>
          <p className="font-mono text-xs">{errorMessage(error)}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
```

Four rules encoded:

1. **`'use client'`** — boundaries are client-only.
2. **`override render()`** — required by `noImplicitOverride: true` in `tsconfig.json`. Without the keyword, TypeScript errors.
3. **`static getDerivedStateFromError`** — the React 19 way to catch synchronous render errors. Use `componentDidCatch` only if you also need a side effect (logging).
4. **Discriminate before showing a diagnostic** — match the error shape (here, a regex on `${error.name} ${error.message}`); generic fallback otherwise. Display the message via `errorMessage(error)`, never raw `error.message`.

### When to add an error boundary

| Yes | No |
|---|---|
| A diagnostic query intentionally throws | A query that returns `null` for missing data — render a fallback instead |
| A client integration may throw on misconfiguration | A network error from a `useQuery` — that's already a state, not a throw |
| Render of a third-party widget fails on certain inputs | A form submission throws — show the error in `submitError` state |

### Don't

- Don't use `error.tsx` (the App Router file convention) for *recoverable* errors — it's the route-level fallback for unhandled errors.
- Don't catch errors silently. The whole point of a boundary is a visible, actionable message.
- Don't put server-side code (server-only modules, `withAuth`) in a boundary — they're client components.

### Diagnostic UX

On the matched failure mode, a good diagnostic boundary shows three things:

1. A clear "something is broken" headline.
2. The specific configuration to check (e.g. `WORKOS_CLIENT_ID` must match across env files).
3. The error message via `errorMessage(error)` in mono font for copy/paste into bug reports.

For any other throw, fall back to the generic panel — no config hints, since they don't apply.

Make the next person debug in 30 seconds, not 30 minutes.
