---
name: decisions
description: Standing decisions encoded by this codebase. Each is load-bearing — do not change without updating this skill.
---

# Standing decisions

Format: decision · rationale · affected files · stability note.

## 1. Next.js 16 with `proxy.ts`, not `middleware.ts`

- Next.js 16 renamed the global request handler. `middleware.ts` is gone.
- `proxy.ts` exports `authkitProxy()` with a matcher that excludes Next static assets.
- Affected: `proxy.ts`, `package.json` (Next 16.x).
- Do not change without updating this skill.

## 2. Convex is the only backend

- All business data goes through Convex queries / mutations / actions / http.
- Next.js route handlers exist only for: `/healthz`, WorkOS auth callback, WorkOS sign-in / sign-up redirects.
- No `app/api/*` for business logic. If you need a Next API route, write a Convex `httpAction` instead and register it on the Convex HTTP router.
- Affected: `convex/`, `app/auth/`, `app/healthz/`.
- Do not change without updating this skill.

## 3. WorkOS AuthKit bridged to Convex, 4-layer authz model

- Proxy → server layout gate → reactive client state → Convex handler `getUserIdentity()` + `parse()`. Layer 4 is non-negotiable.
- `proxy.ts`, `app/<route>/layout.tsx`, `convex/<domain>.ts`, `docs/auth-layers.md`.
- Layer 3 is opt-in; Layers 1, 2, and 4 are always present on authed routes.
- Do not change without updating this skill.

## 4. Zod schemas live in `convex/schemas/`

- Single source of truth. Schemas are imported by both the client (RHF resolver) and the Convex handler (server-side `parse()`).
- `convex/schemas/<feature>.ts`, consumed by `app/<route>/page.tsx` and `convex/<feature>.ts`.
- Do not define a separate "API" schema. One file, two consumers.
- Do not change without updating this skill.

## 5. Convex mutations call `getUserIdentity()` then `parse()` before any DB write

- This is Layer 4 enforcement.
- Every mutation in `convex/<domain>.ts` follows this shape.
- Public mutations without these two calls are a data leak.
- Do not change without updating this skill.

## 6. Forms use React Hook Form + `zodResolver`, shadcn `Form` primitives wrap fields

- `useForm<FeatureInput>({ resolver: zodResolver(schema), defaultValues })`. Field error via `<FormMessage />`, top-level submit error via `<p role="alert">`.
- `components/ui/form.tsx`; consumed by every form route under `app/`.
- Do not change without updating this skill.

## 7. Zustand stores use `persist`, storage key prefixed with project slug

- Every `persist` `name` is `<project-slug>:<store>` so two apps on a shared host don't collide in localStorage. Example: `stores/sidebar.ts`.
- Persisted slices must be read via a mount-gated selector to avoid hydration mismatch.
- Do not change without updating this skill.

## 8. UI built on Base UI + shadcn `base-nova` + Tailwind v4 + Lucide

- Buttons wrap `@base-ui/react/button` Button as `ButtonPrimitive`, not Radix Slot (`components/ui/button.tsx`).
- shadcn style is `base-nova` (`components.json`).
- Tailwind v4 is PostCSS-only — no `tailwind.config.js`. Theme tokens are CSS variables in `app/globals.css`.
- `@radix-ui/react-slot` is used only by `<FormControl>` (`components/ui/form.tsx`).
- Do not change without updating this skill.

## 9. `cn()` from `lib/utils.ts` is the canonical class merger

- `cn(...inputs)` = `twMerge(clsx(inputs))` (`lib/utils.ts`).
- `props.className` is always last in `cn(...)` so caller overrides win.
- Do not change without updating this skill.

## 10. Theme via `next-themes` `class` attribute + mount-gate

- `<html suppressHydrationWarning>` on the root layout.
- `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>`.
- Theme toggle gates render on `mounted` to prevent SSR/CSR mismatch.
- Do not change without updating this skill.

## 11. Bun is the package manager and runtime; multi-stage alpine Dockerfile builds standalone

- `oven/bun:1.2-alpine` in all stages.
- `output: 'standalone'` in Next config.
- `bun install --frozen-lockfile --ignore-scripts` in the deps stage.
- Do not change without updating this skill.

## 12. Biome (not ESLint / Prettier), single-quote JS, double-quote JSX, 2-space indent

- Settings in `biome.json`.
- `package.json` scripts wrap `biome lint`, `biome format`, `biome check --write`.
- Do not change without updating this skill.

## 13. Lefthook enforces Biome on staged files and Vitest on push

- Pre-commit: `bunx biome check --write --no-errors-on-unmatched {staged_files}` with `stage_fixed: true` (`lefthook.yml`).
- Pre-push: `bun run test`.
- `postinstall: lefthook install` (`package.json`) ensures hooks are set up.
- Do not change without updating this skill.

## 14. `just` is the canonical task runner

- All workflows go through the `justfile`. Don't add npm scripts that duplicate just recipes.
- `set dotenv-filename := ".env.local"` — recipes implicitly load `.env.local`.
- WSL constraint: `CONVEX_TMPDIR=./.convex-tmp` for `convex dev` to avoid `/tmp` cross-filesystem errors.
- Do not change without updating this skill.

## 15. Deferred integrations follow the recipe in `docs/integrations.md`

- Resend, Paddle, pino, Vercel AI each have a fixed shape: `env.ts` block, `lib/<integration>.ts` helper, Convex layer (mutation / action / httpAction), webhook pattern mirroring `authKit.events()`.
- `docs/integrations.md` is authoritative. A fifth integration must write its recipe before code.
- Do not change without updating this skill.
