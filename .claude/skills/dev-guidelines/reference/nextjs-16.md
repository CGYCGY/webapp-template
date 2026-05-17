# Next.js 16

This codebase runs Next.js 16 (`package.json`). LLMs trained on Next 13–15 will get these footguns wrong.

## Three footguns

1. **`proxy.ts` replaces `middleware.ts`.** Old name does not work. File is at the repo root, not under `src/`. Exports a default function plus a `config` object with a `matcher`.
2. **`proxy.ts` exports `default authkitProxy()`** — a function returned by the WorkOS helper — not a custom named function called `middleware`.
3. **Read `node_modules/next/dist/docs/`** before relying on training-data Next.js knowledge. Per `AGENTS.md`.

## `proxy.ts` skeleton

```ts
// proxy.ts (repo root, not src/)
import { authkitProxy } from '@workos-inc/authkit-nextjs';

export default authkitProxy();

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

The matcher runs the proxy on every request except Next static asset URLs. Don't narrow it to only authed routes — WorkOS needs to see every request to refresh the access token in time.

## Server-layout gate skeleton (Layer 2)

```tsx
// app/<route>/layout.tsx
import { withAuth } from '@workos-inc/authkit-nextjs';
import { redirect } from 'next/navigation';
import { api } from '@/convex/_generated/api';
import { fetchAuthedQuery } from '@/lib/convex-server';

export default async function GatedLayout({ children }: { children: React.ReactNode }) {
  const { user } = await withAuth();
  if (!user) redirect('/');

  const me = await fetchAuthedQuery(api.users.getMe, {});
  if (!me?.displayName) redirect('/onboarding');

  return <>{children}</>;
}
```

- `withAuth()` reads the WorkOS session server-side.
- `fetchAuthedQuery` attaches the access token to a `ConvexHttpClient` so the query runs as the authenticated user. Plain `client.query()` would run unauthenticated and silently return `null`.
- The redirect runs server-side — no flash of the gated content.

## Server vs client matrix

| File / shape | Side | Notes |
|---|---|---|
| `app/layout.tsx` | Server | Always. Imports server-only modules safely. |
| `app/<route>/layout.tsx` | Server | Run gates here. |
| `app/<route>/page.tsx` | Server by default | Add `'use client'` only when you need React state, refs, or interactivity. |
| `app/<route>/route.ts` | Server | Always. No `'use client'`. |
| `error.tsx` | Client | Always — Next renders it on the client. |
| `actions.ts` | Server | First line: `'use server';`. Functions become server actions. |

## Server actions

```ts
// app/<route>/actions.ts
'use server';

import { signOut } from '@workos-inc/authkit-nextjs';

export async function signOutAction() {
  await signOut();
}
```

Consumed by a client form:

```tsx
<form action={signOutAction}>
  <Button type="submit">Sign out</Button>
</form>
```

Use a server action when you need `cookies()`, `headers()`, or a server-only SDK (like WorkOS's `signOut`). For DB writes, prefer a Convex mutation.

Inline server actions inside a Server Component are also valid, but extract to `actions.ts` once they grow past one statement.

## Route handlers

Three legitimate uses in this codebase:

1. **Health checks** — `app/healthz/route.ts` uses `export const dynamic = 'force-static'` and returns a plain `Response`. The Dockerfile HEALTHCHECK hits this.
2. **WorkOS auth callback** — `app/auth/callback/route.ts` re-exports `handleAuth()` from `@workos-inc/authkit-nextjs`.
3. **WorkOS sign-in / sign-up redirects** — `app/auth/sign-in/route.ts` and `app/auth/sign-up/route.ts` redirect to the URL returned by `getSignInUrl()` / `getSignUpUrl()`.

Do not add route handlers for business logic. Use Convex.

## `output: 'standalone'`

`next.config.ts` sets `output: 'standalone'`. The Docker builder copies `.next/standalone`, `.next/static`, and `public/` only. Don't add bundle-discovering code paths that rely on the full `.next/` tree at runtime.

## Hydration mismatch checklist

Three patterns that prevent hydration mismatch when client-only or persisted state diverges from server render:

1. **`suppressHydrationWarning` on `<html>`** for `next-themes`.
2. **Mount-gate inside a hook** that reads persisted state, returning a stable default until `mounted` flips. Example: a `useSidebarOpen()` selector hook.
3. **Mount-gate inside a component** that renders different output based on `theme` or `resolvedTheme`. Render a disabled placeholder on the server pass.

When you write a new client component that reads a Zustand-persisted slice or `next-themes`, decide which mount-gate pattern fits.

## Don't

- Don't write `middleware.ts`. Don't ask "where is the middleware."
- Don't add `app/api/*` for business logic.
- Don't put `'use client'` in a `layout.tsx`.
- Don't import server-only modules from a client component.
- Don't rely on `getServerSideProps` / `getStaticProps` — they don't exist in the App Router.
