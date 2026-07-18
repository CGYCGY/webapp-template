# Anatomy of the WorkOS ↔ Convex auth bridge

Two distinct flows that must both work; they fail differently.

- **JWT bridge** — client SSO becomes Convex identity. Runs on every authed request.
- **Webhook dispatch** — WorkOS server events drive Convex DB writes. Runs out-of-band.

## JWT bridge — five surfaces

```
Browser → proxy.ts → AuthKitProvider → useAuthFromAuthKit → ConvexProviderWithAuth
                                                                  │ JWT
                                                                  ▼
                                                       Convex deployment
                                                                  │
                                              handler reads ctx.auth.getUserIdentity()
```

### 1. Edge — `proxy.ts`

```ts
import { authkitProxy } from '@workos-inc/authkit-nextjs';
export default authkitProxy();
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
```

Runs on every request. Reads / refreshes the WorkOS session cookie. **Don't narrow the matcher** to authed routes — the proxy needs every request to keep the access token fresh.

### 2. WorkOS provider exposes auth state to React

`components/convex-client-provider.tsx`:

```tsx
<AuthKitProvider>{children}</AuthKitProvider>
```

`AuthKitProvider` from `@workos-inc/authkit-nextjs/components` makes WorkOS session state available to React via `useAuth()` and `useAccessToken()`.

### 3. Adapter hook — converts WorkOS state into the shape Convex wants

```tsx
function useAuthFromAuthKit() {
  const { user, loading: isLoading } = useAuth();
  const { getAccessToken, refresh } = useAccessToken();
  const fetchAccessToken = useCallback(async ({ forceRefreshToken } = {}) => {
    if (!user) return null;
    try {
      if (forceRefreshToken) return (await refresh()) ?? null;
      return (await getAccessToken()) ?? null;
    } catch { return null; }
  }, [user, refresh, getAccessToken]);
  return { isLoading, isAuthenticated: !!user, fetchAccessToken };
}
```

`fetchAccessToken` returns the WorkOS JWT (or refreshes on demand). This is the contract Convex expects from `useAuth`.

### 4. Convex client uses the adapter

```tsx
<AuthKitProvider>
  <ConvexProviderWithAuth client={convex} useAuth={useAuthFromAuthKit}>
    {children}
  </ConvexProviderWithAuth>
</AuthKitProvider>
```

`ConvexProviderWithAuth` attaches the JWT to every Convex request automatically.

### 5. JWT issuer config on the Convex side

`convex/auth.config.ts`:

```ts
import { authKit } from './auth';
export default { providers: authKit.getAuthConfigProviders() };
```

The `@convex-dev/workos-authkit` component supplies the issuer / JWKS config so the Convex deployment can validate WorkOS-issued JWTs. **`convex/auth.config.ts` must be deployed** — `bunx convex deploy` reads it.

### 6. Handler reads identity

```ts
// convex/users.ts — whoami
const identity = await ctx.auth.getUserIdentity();
if (!identity) {
  throw new ConvexError({
    message:
      process.env.NODE_ENV === 'production'
        ? 'Not authenticated.'
        : 'No Convex identity — JWT bridge is broken or user is not signed in.',
  });
}
return { subject: identity.subject };
```

`identity.subject` is the WorkOS `user_xxx` id. Use it as the join key for your `users` table.

`whoami` returns `{ subject }` only — no `tokenIdentifier` or other internals. It throws `ConvexError` (plain `Error` is redacted to "Server Error" in prod, so the payload wouldn't reach the client). The verbose bridge-diagnostic string is gated behind `process.env.NODE_ENV !== 'production'` so prod clients never see internal diagnostics.

### Failure modes — JWT bridge

| Symptom | Likely cause |
|---|---|
| All Convex queries return `null` for a signed-in user | `convex/auth.config.ts` not deployed, or `WORKOS_CLIENT_ID` mismatch |
| A diagnostic `whoami` throws "No Convex identity" | JWT bridge broken — check Convex env `WORKOS_CLIENT_ID` matches `NEXT_PUBLIC_WORKOS_CLIENT_ID` |
| Convex calls work in dev but fail in prod | Convex env not synced — run `just convex-env-sync` |

A `whoami`-style query that **intentionally throws** when there's no identity (wrapped in a class error boundary — see `reference/architecture.md` → Error handling) makes this failure mode visible in 30 seconds instead of 30 minutes.

## Webhook dispatch — two surfaces

### 1. AuthKit event handlers

`convex/auth.ts`:

```ts
export const { authKitEvent } = authKit.events({
  'user.created': async (ctx, event) => {
    // Idempotent: existence check + early return before insert. Pairs with
    // users.bootstrapSelf so the webhook and the JIT path can't race into
    // duplicate rows for a sign-up that originated against this deployment.
    const existing = await ctx.db
      .query('users')
      .withIndex('authId', (q) => q.eq('authId', event.data.id))
      .unique();
    if (existing) return;
    await ctx.db.insert('users', {
      authId: event.data.id,
      email: event.data.email,
      name: `${event.data.firstName ?? ''} ${event.data.lastName ?? ''}`.trim(),
    });
  },
  'user.updated': async (ctx, event) => { /* withIndex lookup + patch */ },
  'user.deleted': async (ctx, event) => { /* withIndex lookup + delete */ },
});
```

Runs in a Convex mutation context. **No `ctx.auth` here** — webhooks are server-to-server, not user-driven. Use `event.data.id` (the WorkOS user id) as `authId`.

#### JIT fallback — `users.bootstrapSelf`

The `user.created` webhook only fires for sign-ups originated against THIS deployment. A WorkOS account created via another app in the same org arrives with a valid JWT but **no Convex row** — and even for local sign-ups the webhook is out-of-band, so the first authed request may land before it. `bootstrapSelf` closes both gaps: an idempotent mutation, called once per sign-in from the client identity bridge, that provisions the row from `identity` when missing and returns the existing row otherwise.

```ts
// convex/users.ts — bootstrapSelf
export const bootstrapSelf = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: 'Not authenticated' });
    const existing = await ctx.db
      .query('users')
      .withIndex('authId', (q) => q.eq('authId', identity.subject))
      .unique();
    if (existing) return existing;
    const id = await ctx.db.insert('users', {
      authId: identity.subject,
      email: identity.email ?? '',
      name: identity.name ?? '',
    });
    return await ctx.db.get(id);
  },
});
```

Idempotent existence check + the matching guard in `user.created` are a pair: whichever path runs first inserts, the other no-ops. Never duplicate rows.

### 2. Route registration

`convex/http.ts`:

```ts
import { httpRouter } from 'convex/server';
import { authKit } from './auth';
const http = httpRouter();
authKit.registerRoutes(http);
export default http;
```

`registerRoutes` wires `/workos/webhook` (or wherever WorkOS POSTs) on the Convex HTTP router. Deployed URL: `https://<deployment>.convex.site/workos/webhook`.

### 3. WorkOS dashboard config

Point the webhook URL in the WorkOS dashboard at the Convex URL above. Set the signing secret to match `WORKOS_WEBHOOK_SECRET` in Convex env. Run `just convex-env-sync` after editing `.env.local`.

### Failure modes — webhook

| Symptom | Likely cause |
|---|---|
| `getMe` returns `null` for a fresh user despite signed-in session | Webhook didn't fire (or account came from another org app) — `bootstrapSelf` should JIT-provision on sign-in; if still null, check WorkOS dashboard → Webhooks → recent deliveries |
| Webhook deliveries show 401 in WorkOS dashboard | `WORKOS_WEBHOOK_SECRET` mismatch between Convex env and WorkOS |
| "User not found for update" warning | `user.updated` fired before `user.created` — race; resolves on retry |

## When you add a new webhook integration

1. Create `convex/<provider>.ts` mirroring the `authKit.events(...)` shape — one events object dispatching by event type.
2. Register the routes on the HTTP router in `convex/http.ts`.
3. Add the provider's webhook signing secret to `env.ts` server block, `.env.local`, and `just convex-env-sync` so Convex sees it.
4. **Verify the signature** inside the `httpAction` **before** dispatching to any mutation.
5. Store relevant rows in Convex tables; expose query helpers that the UI consumes via `useQuery`.

## Why this shape

- **Edge proxy + cookie** — single source of session state; the rest of the app never reads cookies directly.
- **Adapter hook** — WorkOS and Convex have different auth APIs; one tiny adapter bridges them, isolated from the rest of the client.
- **`convex/auth.config.ts`** — the Convex side validates JWTs against the issuer; rotating WorkOS credentials only requires redeploying this file.
- **Webhook dispatch via `events()`** — typed handlers per event, all in one place; mirror the shape for every new provider.
