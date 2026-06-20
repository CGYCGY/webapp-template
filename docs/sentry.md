# Sentry — Crash and Error Reporting

`@sentry/nextjs` catches unhandled exceptions on the client, server (Node.js runtime), and edge runtime, plus unhandled promise rejections and React render errors. Stack traces are de-minified via sourcemaps uploaded at build time.

This template ships with Sentry wired but disabled by default — leaving the DSN unset is a no-op. See `mobile-template/docs/sentry.md` for the React Native sibling setup.

## 1. Create the project

Sentry → **Projects → Create Project**.

- Platform: **Next.js**.
- Alert frequency: default is fine.
- Team: whichever you want to own the project.

After creation, Sentry shows the DSN — copy it.

## 2. Wire the DSN

Put the DSN in `.env.local`:

```
NEXT_PUBLIC_SENTRY_DSN=https://abcdef@o12345.ingest.sentry.io/67890
SENTRY_DSN=https://abcdef@o12345.ingest.sentry.io/67890
```

Both names hold the same value. The split exists because Next.js inlines only `NEXT_PUBLIC_`-prefixed vars into the client bundle, while server-side code and the Sentry CLI read plain `SENTRY_DSN` from the process environment.

The DSN is technically public (it's embedded in every shipped client bundle) so committing it in a public template would be safe, but keeping it in `.env.local` makes per-project overrides cleaner.

Leave both unset to disable Sentry entirely — `Sentry.init` is skipped in each config file when the DSN is empty.

## 3. Auth token for sourcemap upload

Sourcemaps must be uploaded at **build** time so Sentry can translate the minified browser/server stack frames back to source. This needs a Sentry CLI auth token with `project:releases` scope.

1. Sentry → **Settings → Account → Auth Tokens → Create New Token**.
2. Scopes: `project:read`, `project:releases`, `org:read`.
3. Copy the token (shown once).

Store it as a CI secret — it must be available inside the build worker, not in the JS bundle:

```bash
# GitHub Actions
gh secret set SENTRY_AUTH_TOKEN --body sntrys_...
```

For local production builds (`bun run build`), export it in your shell:

```bash
export SENTRY_AUTH_TOKEN=sntrys_...
```

Without the auth token the build still succeeds; sourcemaps just aren't uploaded and stack traces will show minified frames in the Sentry dashboard.

## 4. Org and project slugs

`withSentryConfig` in `next.config.ts` reads `SENTRY_ORG` and `SENTRY_PROJECT` from the environment to target the right Sentry project when uploading sourcemaps. Set them in CI:

```bash
gh secret set SENTRY_ORG --body your-org-slug
gh secret set SENTRY_PROJECT --body webapp-template
```

Or locally:

```bash
export SENTRY_ORG=your-org-slug
export SENTRY_PROJECT=webapp-template
```

If both are unset, `withSentryConfig` skips sourcemap upload — the build still works.

## 5. How init is wired

Three runtime targets, three init files:

- **`sentry.client.config.ts`** — runs in the browser. Auto-loaded by `withSentryConfig`. Enables Session Replay (`replaysSessionSampleRate: 0.01`, `replaysOnErrorSampleRate: 0.1`) and exports `onRouterTransitionStart` so client-side navigations are captured as transactions.
- **`sentry.server.config.ts`** — runs in the Node.js runtime (route handlers, server components, server actions). Loaded from `instrumentation.ts` when `process.env.NEXT_RUNTIME === 'nodejs'`. Enables profiling (`profilesSampleRate: 0.1`).
- **`sentry.edge.config.ts`** — runs in the edge runtime (`proxy.ts`, edge route handlers). Loaded from `instrumentation.ts` when `process.env.NEXT_RUNTIME === 'edge'`. Minimal config — profiling and replay aren't available on edge.

`instrumentation.ts` also re-exports `Sentry.captureRequestError` as `onRequestError` — Next.js calls this on every server-side request error so it propagates to Sentry with full request context.

`app/global-error.tsx` is required by the App Router: it replaces the root layout when an error bubbles up past every other error boundary. It includes its own `<html><body>` and calls `Sentry.captureException` on mount so the final fallback is still reported.

## 6. `withSentryConfig` options

Set in `next.config.ts`:

| Option | Value | Why |
| --- | --- | --- |
| `org` | `process.env.SENTRY_ORG` | Sourcemap upload target. |
| `project` | `process.env.SENTRY_PROJECT` | Sourcemap upload target. |
| `silent` | `!process.env.CI` | Quiet during local builds, verbose in CI. |
| `widenClientFileUpload` | `true` | Upload sourcemaps for all client chunks, not just `_next/static`. |
| `tunnelRoute` | `'/monitoring'` | Route Sentry traffic through a same-origin endpoint to evade adblockers. |
| `disableLogger` | `true` | Tree-shake Sentry's internal logger out of the client bundle. |
| `automaticVercelMonitors` | `false` | Don't auto-create Vercel cron monitors — this template doesn't deploy to Vercel. |

## 7. Verify it works

Throw a test error in dev:

```tsx
'use client';
import * as Sentry from '@sentry/nextjs';

export function CrashButton() {
  return (
    <button
      type="button"
      onClick={() => {
        Sentry.captureException(new Error('Sentry test from webapp-template'));
      }}
    >
      Send test error
    </button>
  );
}
```

Or trigger an uncaught server error from a route handler:

```ts
export async function GET() {
  throw new Error('Sentry test from webapp-template (server)');
}
```

Open the Sentry dashboard → **Issues**. Within ~30s you should see the event. If you don't:

- Confirm `NEXT_PUBLIC_SENTRY_DSN` is set and visible in the browser bundle (`view-source:` and search for the DSN).
- Confirm `SENTRY_DSN` is set in the server environment.
- Add `debug: true` to `Sentry.init` in the relevant config to see SDK startup logs.
- For sourcemap issues, check the Sentry **Releases** page — a release for your build should appear with sourcemap artifacts attached.

## What gets captured

- **Client JS exceptions** — unhandled errors and promise rejections in the browser.
- **Server errors** — exceptions thrown in route handlers, server components, and server actions, via `onRequestError`.
- **Edge errors** — anything thrown in `proxy.ts` or edge route handlers.
- **React render errors** — the App Router error boundary feeds into `global-error.tsx`, which reports to Sentry.
- **Session Replay (sampled)** — DOM snapshots around errors, 1% baseline / 10% on error.
- **Navigation transactions** — `onRouterTransitionStart` instruments client-side router transitions.

To exclude noisy errors, use Sentry's **Inbound Filters** (Project Settings → Inbound Filters) — that's faster than redeploying with `beforeSend` logic.

## References

- Sentry Next.js: <https://docs.sentry.io/platforms/javascript/guides/nextjs/>
- Next.js instrumentation: <https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation>
- Sibling setup: `mobile-template/docs/sentry.md`
