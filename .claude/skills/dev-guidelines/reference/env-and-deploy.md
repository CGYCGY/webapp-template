# Env & deploy

## `env.ts` — server/client split

```ts
// env.ts
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    WORKOS_CLIENT_ID: z.string().min(1),
    WORKOS_API_KEY: z.string().min(1),
    WORKOS_COOKIE_PASSWORD: z.string().min(32),
    WORKOS_WEBHOOK_SECRET: z.string().min(1),
    WORKOS_ACTION_SECRET: z.string().min(1),
  },
  client: {
    NEXT_PUBLIC_CONVEX_URL: z.string().min(1),
    NEXT_PUBLIC_WORKOS_CLIENT_ID: z.string().min(1),
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: z.url(),
  },
  runtimeEnv: { /* mirror every server+client key to process.env */ },
  emptyStringAsUndefined: true,
});
```

Rules:

- **Server keys never appear in the `client` block.** `@t3-oss/env-nextjs` enforces this — a secret in `client` ends up in the browser bundle.
- **Client keys must be prefixed `NEXT_PUBLIC_`** — Next requires it for inlining.
- **Every key listed in `server` or `client` must also be in `runtimeEnv`** — `@t3-oss/env-nextjs` reads them through that map.

## Boot-time validation

```ts
// next.config.ts
import './env';
```

Importing `env.ts` from the Next config makes `bun run build` fail when a required var is missing. The Dockerfile sets `SKIP_ENV_VALIDATION=1` at build time only — the runtime container revalidates against real envs.

## Two env runtimes

| Runtime | Validated by | Set via | Examples |
|---|---|---|---|
| Next.js app | `env.ts` (`@t3-oss/env-nextjs`) | `.env.local` (`.env.production` for prod build) | `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_POSTHOG_KEY`, `SENTRY_DSN`, `WORKOS_API_KEY` |
| Convex backend | none — accessed via `process.env` in queries/mutations/actions | `bunx convex env set KEY VALUE` (or `just env-set`) | `R2_ACCOUNT_ID`, `R2_SECRET_ACCESS_KEY`, `WORKOS_WEBHOOK_SECRET` |

Vars used in BOTH runtimes (e.g. `WORKOS_*` when Convex calls WorkOS): keep in `env.ts`, then `just env-sync` reads `.env.local`, filters for the configured prefixes, and pushes them to Convex. Run it after editing any synced var.

Rule: if **only** Convex reads a var, do NOT add it to `env.ts` — it noises up validation for no benefit. `R2_*` are the canonical Convex-only example.

## When you add a new env var

1. Add to `env.ts` under the right block (server or client).
2. Add to the `runtimeEnv` map.
3. Add to `.env.local` with a real value.
4. Add to `.env.local.example` with a placeholder so other developers know it exists.
5. If used by Convex handlers: extend `SYNC_PREFIXES` in `justfile` and run `just env-sync`.
6. If used at build time and prefixed `NEXT_PUBLIC_`: also add `ARG`/`ENV` lines to `deploy/Dockerfile`.

## Dockerfile contract

`deploy/Dockerfile`:

- **Stages**: `deps` (Bun frozen install) → `builder` (`bun run build`) → `runner` (Bun + alpine, non-root user).
- **`NEXT_PUBLIC_*` vars must be `ARG`'d in the builder stage** so Next inlines them into the client bundle. Server-only vars are read at runtime by Coolify.
- **`output: 'standalone'`** — runtime copies `.next/standalone`, `.next/static`, `public/` only.
- **HEALTHCHECK** wget-hits `http://127.0.0.1:3000/healthz` every 60s (loopback IP, not `localhost`). `app/healthz/route.ts` returns `force-static` 200.
- **CMD**: `["bun", "server.js"]` — `bun` runs the standalone server. Don't change to `node` without testing.

## `deploy/deploy.sh`

Orchestrates: build → push to GHCR → trigger Coolify webhook.

- Image name derived from `GITHUB_ORG/REPO_NAME` (override via `deploy/.env.deploy`).
- `NEXT_PUBLIC_*` from `.env.production` is passed as `--build-arg` so the builder stage inlines them.
- Coolify webhook needs `COOLIFY_WEBHOOK_URL` and `COOLIFY_API_TOKEN` in `deploy/.env.deploy`.

Run via `just deploy [tag]`.

## Integration env vars

Set by the Sentry / PostHog / R2 backport. See `docs/integrations.md` for usage; this is just the inventory.

- **Next.js app (`env.ts`)**: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`.
- **Convex-only** (`bunx convex env set`): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`. Do NOT add to `env.ts`.

## Don't

- Don't `process.env.FOO` directly outside `env.ts` — use `import { env } from '@/env'` so types are checked.
- Don't put a secret in the `client` block. Secrets are server-only.
- Don't skip `just env-sync` after editing `WORKOS_*` — Convex won't see the new value.
- Don't put non-secret-but-changeable values (model names, feature flags) in env. Hardcode in a `lib/` module so changes are diffable.
