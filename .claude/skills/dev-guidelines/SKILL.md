---
name: dev-guidelines
description: Coding standards and architecture rules for this codebase. Covers Next.js 16 with proxy.ts (not middleware.ts), Convex as the backend, WorkOS AuthKit bridged to Convex, Zod schemas shared between client and server, React Hook Form, Base UI primitives, shadcn base-nova style, Tailwind v4, Zustand persist, Bun, Biome, Vitest, Playwright, and the Coolify + GHCR deploy flow. Use when adding any feature, route, mutation, schema, form, store, integration, or deploy change.
---

# dev-guidelines

This skill describes the shape new code should hold to. `reference/` defines the patterns, `decisions.md` enumerates the standing rules. The codebase is a worked instance — useful for reading, but if it disagrees with the skill, the skill wins (and the codebase has drifted). Don't invent new conventions; extend an existing one.

Before writing any Next.js code, read the relevant guide in `node_modules/next/dist/docs/`. This is Next.js 16; APIs and file layout differ from older Next that LLMs were trained on. See `AGENTS.md`.

## Stack lock-in

| Concern | Choice |
|---|---|
| Language | TypeScript, `strict` + `noUncheckedIndexedAccess` + `noImplicitOverride` |
| Runtime / PM | Bun (frozen lockfile, alpine in prod) |
| Framework | Next.js 16 App Router with `proxy.ts` (not `middleware.ts`) |
| Next output | `output: 'standalone'` |
| Backend | Convex (queries / mutations / actions / http) |
| File storage | Cloudflare R2 via Convex `'use node'` action (`convex/r2.ts`); client hooks in `lib/r2/` |
| Auth | WorkOS AuthKit bridged to Convex via `@convex-dev/workos-authkit`, 4-layer model |
| Env | `@t3-oss/env-nextjs` + Zod, `import './env'` from `next.config.ts` |
| Forms | Zod v4 + React Hook Form + `zodResolver`; schemas in `convex/schemas/` |
| State | Zustand v5 + `persist`, storage key prefixed `<project-slug>:` |
| UI primitives | Base UI (`@base-ui/react`) — not pure Radix; `@radix-ui/react-slot` only for `<FormControl>` |
| Styling | Tailwind v4 (PostCSS only), shadcn `base-nova`, `cn()` from clsx + tailwind-merge, CVA for variants |
| Icons | Lucide, `size-4` default |
| Theme | `next-themes` `class` attribute + mount-gate against hydration mismatch |
| Date | `date-fns` v4 via `lib/date.ts` wrapper |
| Crash reporting | Sentry (`@sentry/nextjs`); init in `sentry.{client,server,edge}.config.ts` + `instrumentation.ts`; root boundary at `app/global-error.tsx` |
| Analytics | PostHog (`posthog-js` + `posthog-node`); provider in `lib/posthog/client.tsx`; pageview in `app/PostHogPageView.tsx` |
| Lint / format | Biome 2, single-quote JS, double-quote JSX, 2-space indent, organize imports on |
| Git hooks | Lefthook (pre-commit Biome, pre-push Vitest) |
| Unit tests | Vitest + jsdom + Testing Library, `vite-tsconfig-paths` |
| E2E | Playwright, `workers: 1`, `retain-on-failure` trace |
| Task runner | `just` |
| Deploy | Multi-stage Bun + Alpine → GHCR → Coolify webhook |
| Path alias | `@/*` → repo root |

## Adding a feature — the workflow

1. **Pick the layer.** Auth check / per-request rewrite → `proxy.ts`. Server-side gate before render → server `layout.tsx` (use `withAuth` + `fetchAuthedQuery`). UI → client component with `'use client'`. Data read / write → Convex query / mutation. Side-effects (email, third-party calls) → Convex `action`. Webhook receiver → Convex `httpAction` registered in `convex/http.ts`.
2. **Define the Zod schema** in `convex/schemas/<feature>.ts`. Export both `z.input` (form values) and `z.output` (post-parse) types.
3. **Convex side.** Use `args: v.object({...})` for the Convex arg validator, then inside the handler call `ctx.auth.getUserIdentity()` and `<schema>.parse(args)` before any DB write. Query rows via `.withIndex(...)`, never table scans.
4. **Client side.** `useForm` + `zodResolver(schema)` for forms; `useMutation` / `useQuery` to call Convex. From Server Components, never `new ConvexHttpClient()` directly — call `fetchAuthedQuery` from `lib/convex-server.ts`.
5. **Hydration-sensitive UI** (persisted Zustand, `next-themes`) must mount-gate with `useState(false) + useEffect(() => setMounted(true))`. See `reference/nextjs-16.md` → Hydration mismatch checklist.
6. **Layouts and `route.ts` stay server-side.** No `'use client'` in them.

## Quick reference

| Question | Answer |
|---|---|
| Where do queries / mutations go? | `convex/<domain>.ts` |
| Where do schemas live? | `convex/schemas/<feature>.ts` |
| How do I run a Convex query as the user from a Server Component? | `fetchAuthedQuery` from `lib/convex-server.ts` |
| How do I add a webhook receiver? | `httpAction` in `convex/<provider>.ts`, register on the router in `convex/http.ts` |
| Server action vs Convex mutation? | Server action: needs `next/headers`, cookies, or WorkOS server SDK (e.g. `signOut`). Everything else: Convex mutation. |
| Path alias for imports? | `@/*` → repo root |

## Tooling commands

| Command | What it does |
|---|---|
| `just dev` | tmux split with `bunx convex dev` + `bun run dev` |
| `just typecheck` | `tsc --noEmit` |
| `just check` | Biome lint + format + organize imports, writes changes |
| `just test` | Vitest unit tests (CI mode) |
| `just e2e` | Playwright smoke (needs Convex dev + `.env.test` user) |
| `just env-sync` | Push `WORKOS_*` vars from `.env.local` to Convex |
| `just deploy [tag]` | `deploy/deploy.sh`: build image → push GHCR → Coolify webhook |

Run `just check && just typecheck && just test` before every commit. Lefthook enforces lint pre-commit and Vitest pre-push.

## Coding standards

Apply across all code:

- **DRY** — extract repeated logic only once you have two real call sites.
- **KISS** — prefer the most obvious solution; avoid clever abstractions.
- **YAGNI** — no speculative code for hypothetical future requirements.
- **SoC** — proxy, layout, page, Convex handler each have one job. Don't blur them.
- **Boy Scout Rule** — leave touched files cleaner than you found them, within scope.
- **Fail-Fast** — throw early on invalid input. Every Convex mutation calls `getUserIdentity()` and `parse()` up front.
- **SOLID-DIP** — the 4-layer authz model is layered dependency by design. Don't reach across layers.
- **POLA** — match the existing pattern; surprise is a bug. New webhook? Mirror `authKit.events()` in `convex/auth.ts`.

No comments unless they document a non-obvious *why*. No JSDoc. No commented-out code.

## Supporting files

| File | Read when |
|---|---|
| `reference/architecture.md` | Adding a new route or backend function; deciding which layer it belongs in; adding an error boundary |
| `reference/nextjs-16.md` | Touching `proxy.ts`, `route.ts`, layouts, server actions, or anything Next-specific |
| `reference/convex-patterns.md` | Writing a Convex query / mutation / action / httpAction |
| `reference/forms-and-validation.md` | Writing a form or a Zod schema |
| `reference/ui-and-styling.md` | Adding components, variants, icons, theme-aware UI |
| `reference/state-and-stores.md` | Adding a Zustand store or persisting client state |
| `reference/env-and-deploy.md` | Adding env vars (or splitting Convex-runtime vs Next.js-runtime env vars), changing the Dockerfile, or modifying deploy flow |
| `reference/testing.md` | Writing unit or E2E tests |
| `examples/feature-walkthrough.md` | Adding a new user-data feature — anatomy across the 6 layers |
| `examples/auth-bridge.md` | Understanding or extending the WorkOS↔Convex bridge (JWT + webhook dispatch) |
| `checklists/validation.md` | Pre-commit checklist for any change |
| `checklists/review.md` | Code review checklist |
| `checklists/integration-add.md` | Adding Resend, Paddle, pino, Vercel AI, or any other deferred integration |
| `decisions.md` | The 15 standing decisions this skill encodes — change only with explicit justification |
