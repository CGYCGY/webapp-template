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

## 5. Convex mutations call `getUserIdentity()` then `parseOrThrow(schema, args)` before any DB write

- This is Layer 4 enforcement. `parseOrThrow` (`convex/lib/validate.ts`) `throw`s a `ConvexError` on invalid input; authz failures also `throw new ConvexError({ message })`.
- Client unwraps the thrown message via `errorMessage(err)` (`convex/lib/errorMessage.ts`), which brand-detects `ConvexError` across `convex` copies.
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

- `oven/bun:1.3-alpine` in all stages.
- `output: 'standalone'` in Next config.
- `bun install --frozen-lockfile --ignore-scripts` in the deps stage.
- Do not change without updating this skill.

## 12. Biome (not ESLint / Prettier), single-quote JS, double-quote JSX, 2-space indent

- Settings in `biome.json`.
- `package.json` scripts wrap `biome lint`, `biome format`, `biome check --write`.
- Do not change without updating this skill.

## 13. Lefthook enforces Biome on staged files and Vitest + typecheck on push

- Pre-commit: `bunx biome check --write --no-errors-on-unmatched {staged_files}` with `stage_fixed: true`, glob `*.{js,ts,jsx,tsx,json,jsonc,css}` (`lefthook.yml`).
- Pre-push: `bun run test` AND `bun run typecheck`, run in parallel — both must pass.
- `postinstall: lefthook install` (`package.json`) ensures hooks are set up.
- Do not change without updating this skill.

## 14. `just` is the canonical task runner

- All workflows go through the `justfile`. Don't add npm scripts that duplicate just recipes.
- `set dotenv-filename := ".env.local"` — recipes implicitly load `.env.local`.
- WSL constraint: `CONVEX_TMPDIR=./.convex-tmp` for `convex dev` to avoid `/tmp` cross-filesystem errors.
- Do not change without updating this skill.

## 15. Deferred integrations follow the recipe in `docs/integrations.md`

- Resend, Paddle, pino, Vercel AI each have a fixed shape: `env.ts` block, `lib/<integration>.ts` helper, Convex layer (mutation / action / httpAction), webhook pattern mirroring `authKit.events()`.
- `docs/integrations.md` is authoritative. A new deferred integration must write its recipe before code.
- Do not change without updating this skill.

## 16. File storage is Cloudflare R2 via a Convex `'use node'` action, not Convex built-in storage

- Upload/download go through presigned URLs minted by `convex/r2.ts`; client uploads direct to R2 via `lib/r2/upload.ts`.
- Keys are caller-scoped to `uploads/<userId>/`; `convex/r2.ts` rejects any client-supplied key outside that prefix so an authed user can't sign a URL for another user's object.
- Rationale: bucket shared with mobile, free R2 egress, no per-file size cap.
- R2 credentials live in Convex env (`npx convex env set R2_*`), not `env.ts`.
- Do not change without updating this skill.

## 17. Crash reporting is Sentry (`@sentry/nextjs`), DSN-gated

- Init in `sentry.{client,server,edge}.config.ts` + `instrumentation.ts`; `next.config.ts` is wrapped with `withSentryConfig`.
- Root error boundary is `app/global-error.tsx` (not `error.tsx`).
- DSN-gated so the template builds without Sentry configured. Source-map upload requires `SENTRY_AUTH_TOKEN`.
- Do not change without updating this skill.

## 18. Product analytics is PostHog, one project ID across web + mobile

- Provider in `lib/posthog/client.tsx`, server client in `lib/posthog/server.ts`, identify in `lib/posthog/identify.ts`, pageview in `app/PostHogPageView.tsx`.
- `posthog.init` sets `capture_pageview: false` — pageviews are captured manually by `<PostHogPageView>`; auto-capture would double-count under the App Router.
- `PostHogIdentityBridge` (`lib/posthog/identity-bridge.tsx`, wired in `components/convex-client-provider.tsx`) mirrors WorkOS auth into PostHog: `identify` on sign-in, `reset` on sign-out so the next anonymous session doesn't inherit the distinct ID.
- Client and server read the validated `env` import (`@/env`), never `process.env`.
- Same `NEXT_PUBLIC_POSTHOG_KEY` is used by mobile so analytics are unified per user.
- Do not change without updating this skill.
