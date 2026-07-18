# webapp-template

Opinionated starter for full-stack web apps.

## Stack

- **Next.js 16** (App Router, TypeScript strict, `proxy.ts` replaces `middleware.ts`)
- **Bun** — package manager + runtime
- **Convex** — DB, realtime, file storage, scheduled functions, search, vector search
- **WorkOS AuthKit** — auth, bridged to Convex via `@convex-dev/workos-authkit`
- **Tailwind v4** + **shadcn/ui** + **Base UI** + **Lucide**
- **React Hook Form** + **Zod** (`@hookform/resolvers`)
- **Zustand** (with `persist`), **date-fns**, **next-themes**
- **`@t3-oss/env-nextjs`** — env vars validated at boot
- **Biome** (lint + format), **Lefthook** (git hooks)
- **Vitest** (jsdom) + **Playwright** (E2E smoke)
- **just** — task runner ([justfile](justfile))

> ⚠️ This is **Next.js 16** — APIs, conventions, and file layout differ from older versions. Check `node_modules/next/dist/docs/` before writing code.

## Getting started

```bash
bun install
cp .env.local.example .env.local       # fill in Convex + WorkOS values
bunx convex dev                         # one-time: provisions a deployment
just convex-env-sync                           # push WORKOS_* into Convex
just dev                                # tmux split: Convex sync + Next.js
```

Open <http://localhost:3000>. Sign in via WorkOS → `/dashboard` reads your identity from Convex.

If `tmux` isn't available, run `just convex-dev` and `just start` in separate terminals.

## Environment variables

Required (see `.env.local.example`):

- `NEXT_PUBLIC_CONVEX_URL`
- `WORKOS_CLIENT_ID` / `NEXT_PUBLIC_WORKOS_CLIENT_ID`
- `NEXT_PUBLIC_WORKOS_REDIRECT_URI`
- `WORKOS_API_KEY`
- `WORKOS_COOKIE_PASSWORD` (≥32 chars — `openssl rand -base64 32`)
- `WORKOS_WEBHOOK_SECRET` — endpoint at `https://[deployment].convex.site/workos/webhook`
- `WORKOS_ACTION_SECRET` — placeholder ok if no Actions wired

Schemas live in `env.ts`. Missing or malformed values fail the build, not runtime.

## Commands

`just --list` shows everything. Most-used:

| Command           | What it does                                              |
|-------------------|-----------------------------------------------------------|
| `just dev`        | Convex sync + Next.js dev in a tmux split                 |
| `just dev-stop`   | Kill the tmux session and any stray dev processes         |
| `just convex-env-sync`   | Sync `WORKOS_*` from `.env.local` into Convex             |
| `just check`      | Biome: lint + format + organize imports                   |
| `just typecheck`  | `tsc --noEmit`                                            |
| `just test`       | Vitest (unit)                                             |
| `just e2e`        | Playwright smoke (requires Convex dev + `.env.test`)      |
| `just build`      | Production build                                          |
| `just deploy`     | Build → push to GHCR → trigger Coolify redeploy           |

## Layout

```
app/              Next.js routes (auth, dashboard, onboarding, healthz)
components/       App-level components + shadcn primitives in components/ui/
convex/           Schema, queries, mutations, auth bridge, HTTP routes
lib/              Shared utilities (convex-server, date, cn)
stores/           Zustand stores
deploy/           Dockerfile + deploy.sh (Coolify via GHCR)
docs/             Roadmap, integration guides, smoke-test runbooks
e2e/              Playwright specs
__tests__/        Vitest unit tests
```

## Docs

- [docs/auth-layers.md](docs/auth-layers.md) — layered authz model (WorkOS → Convex → mutations)
- [docs/integrations.md](docs/integrations.md) — deferred integrations (Resend, Paddle, pino, Vercel AI SDK)
- `docs/phase-{3,4,5}-smoke-test.md` — manual smoke-test runbooks

## Deployment

`deploy/Dockerfile` builds a standalone Next.js image. `just deploy [tag]` pushes to GHCR and triggers a Coolify redeploy via webhook. Convex functions deploy separately with `just convex-deploy`.
