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
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: z.string().url(),
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

## `.env.local` and Convex env

Two separate stores of env vars:

1. **Next.js** reads `.env.local` (and `.env.production` for prod builds).
2. **Convex** reads its own env, set via `bunx convex env set KEY VALUE`.

Anything used inside a Convex handler must be set in Convex env. `WORKOS_*` keys are needed by both, so `just env-sync` reads `.env.local`, filters for the `WORKOS_` prefix, and pushes them to Convex. Run it after editing any `WORKOS_*` var.

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
- **HEALTHCHECK** hits `/healthz` every 60s. `app/healthz/route.ts` returns `force-static` 200.
- **CMD**: `["bun", "server.js"]` — `bun` runs the standalone server. Don't change to `node` without testing.

## `deploy/deploy.sh`

Orchestrates: build → push to GHCR → trigger Coolify webhook.

- Image name derived from `GITHUB_ORG/REPO_NAME` (override via `deploy/.env.deploy`).
- `NEXT_PUBLIC_*` from `.env.production` is passed as `--build-arg` so the builder stage inlines them.
- Coolify webhook needs `COOLIFY_WEBHOOK_URL` and `COOLIFY_API_TOKEN` in `deploy/.env.deploy`.

Run via `just deploy [tag]`.

## Don't

- Don't `process.env.FOO` directly outside `env.ts` — use `import { env } from '@/env'` so types are checked.
- Don't put a secret in the `client` block. Secrets are server-only.
- Don't skip `just env-sync` after editing `WORKOS_*` — Convex won't see the new value.
- Don't put non-secret-but-changeable values (model names, feature flags) in env. Hardcode in a `lib/` module so changes are diffable.
