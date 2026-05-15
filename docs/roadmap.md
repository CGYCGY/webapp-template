# Template Build Roadmap

This template is built in **6 phases**. Each phase ends "green": typecheck passes, lint passes, and at least one smoke check (manual or automated) confirms the slice works.

The phasing exists because installing the full stack at once tangles failure modes — when Tailwind v4's PostCSS pipeline conflicts with shadcn's generator, or the Convex `auth` bridge can't see WorkOS sessions, you want one suspect, not ten. Phases also give you commit checkpoints: a bad integration is one `git reset` away.

The tradeoff: phasing is ~30% slower wall-clock than a single `bun add` blast. That's worth it for a template — a broken template propagates to every project that inherits from it.

> **Versioning rule:** every package in every phase must be installed at its **latest stable** release. No betas, no RCs, no nightly builds, no pinning to older majors "to play it safe." If a latest-stable release has a known blocking bug, document it inline and pick the most recent stable that works — but the default is always latest stable. This applies to Next.js, Convex, Tailwind, shadcn primitives, and every transitive choice.
>
> **Carve-out for runtime-tracking type packages.** Packages whose major version tracks an external runtime (e.g. `@types/node`, `@types/bun`, `@types/deno`) are a special case. Their "latest stable" is **latest stable LTS of the underlying runtime**, not the highest version on npm. Pinning `@types/node` to a non-LTS Node line (e.g. odd-numbered majors like 25) causes TypeScript to autocomplete APIs that don't exist on production hosts. For this template: track current Node LTS (Node 22 / "Jod" as of writing) until the next even-numbered LTS supersedes it.

---

## Phase 1 — Bones

**Goal:** working repo with formatting, linting, and pre-commit hooks before any real code lands.

**Install:**
- Next.js 16+ (App Router, TypeScript strict)
- Bun (package manager + runtime)
- Biome (formatter + linter)
- Lefthook (git hooks)

**Configure:**
- `tsconfig.json` with `strict: true`, `noUncheckedIndexedAccess: true`
- `biome.json` with project-wide rules
- `lefthook.yml` running Biome on staged files pre-commit
- `.gitignore`, `.editorconfig`

**Exit criteria:**
- `bun run typecheck` passes on a default Next.js page
- `bun run lint` passes
- A staged file with a lint violation is blocked by Lefthook

**Why first:** the lint/format/hook spine catches mistakes in every subsequent phase. Adding it late means retroactively fixing every file.

---

## Phase 2 — UI Shell

**Goal:** verify the styling pipeline end-to-end with one rendered component.

**Install:**
- Tailwind CSS v4+
- shadcn/ui (initialized via CLI)
- Lucide React (icons)
- CVA (class-variance-authority)
- Motion (installed, unused — reserved for future animation work)

**Configure:**
- Tailwind v4 PostCSS pipeline (`@tailwindcss/postcss`, no `tailwind.config.js` needed for v4)
- shadcn `components.json` pointing at `components/ui/`
- Global stylesheet with `@import "tailwindcss"` and design tokens
- One shadcn primitive (Button) generated to confirm the generator works

**Exit criteria:**
- Root page renders a styled shadcn Button with a Lucide icon
- Dark mode toggle works (if scaffolded)
- No PostCSS warnings in `bun run dev`

**Risk:** Tailwind v4 is new enough that shadcn's CLI generator may need flag adjustments. Isolating this phase makes the fix obvious.

---

## Phase 3 — Data + Auth

**Goal:** authenticated users persisted in Convex, with env vars validated at boot.

**Install:**
- Convex (DB, realtime, file storage, scheduled functions, search, vector search)
- WorkOS AuthKit (Next.js SDK)
- `@t3-oss/env-nextjs` + Zod

**Configure:**
- `convex/` directory with schema, one query, one mutation
- `ConvexProviderWithAuth` wired to WorkOS session token
- WorkOS proxy handling sign-in / sign-out / callback routes (`proxy.ts`, renamed from `middleware.ts` in Next.js 16)
- `env.ts` declaring server + client env vars with Zod schemas
- A `users` table in Convex synced from WorkOS on sign-in

> **Implementation note:** the JWT bridge is implemented via the official `@convex-dev/workos-authkit` Convex component (`convex/convex.config.ts` + `convex/auth.config.ts`). This supersedes the hand-rolled `customJwt` provider approach that was previously the only option. The component also handles user sync via WorkOS webhooks (`POST /workos/webhook`) rather than client-side on sign-in — webhooks cover user updates and deletions from the WorkOS dashboard, not just first sign-in.

**Exit criteria:**
- User can sign in via WorkOS and land on a page that reads their identity from Convex
- Missing env var fails the build, not runtime
- `npx convex dev` and `bun run dev` run side-by-side without conflict

**Risk — highest of any phase:** the WorkOS → Convex auth bridge requires Convex to validate the WorkOS JWT. Using the official `@convex-dev/workos-authkit` component eliminates the hand-rolled JWT validation risk, but the concrete risk shifts to: wiring the component correctly, matching `WORKOS_CLIENT_ID` across Next.js (`.env.local`) and Convex (`npx convex env set`), and confirming the component is deployed before the user signs in. The failure mode is still silent — every downstream query runs unauthenticated. Smoke-test with `convex/users.ts:whoami`, a query that **throws** when `ctx.auth.getUserIdentity()` returns null. The `/dashboard` page surfaces this as a red error box (bridge broken) vs a yellow warning (bridge OK, webhook not fired) vs clean name/email (fully working).

---

## Phase 4 — Forms + State

**Goal:** a working form pattern (validated, typed, submitted to Convex) and a working client-state pattern.

**Install:**
- Zod (already present from Phase 3, confirm)
- React Hook Form
- `@hookform/resolvers` (Zod resolver)
- Zustand
- date-fns

**Configure:**
- One example form: Zod schema → RHF → Convex mutation, with field-level errors
- One example Zustand store for UI state (e.g. sidebar open/closed) with `persist` middleware demonstrated
- date-fns imported in one place to confirm tree-shaking works

**Exit criteria:**
- Form rejects invalid input client-side and server-side (Convex re-validates with the same Zod schema)
- Zustand store survives page navigation; persisted slice survives reload

Layered authz model documented in [docs/auth-layers.md](./auth-layers.md).

**Why after auth:** forms in this stack almost always submit to authenticated mutations, so building them on top of Phase 3 catches real-world wiring (passing identity, handling auth errors) instead of demo wiring.

---

## Phase 5 — Tests

**Goal:** test infrastructure scaffolded with one example of each kind, so adding the second test is trivial.

**Install:**
- Vitest + `@vitejs/plugin-react`
- Playwright + browsers

**Configure:**
- `vitest.config.ts` with jsdom environment, path aliases matching `tsconfig.json`
- One unit test (e.g. a Zod schema or a pure utility)
- `playwright.config.ts` with one browser, `webServer` block starting `bun run dev`
- One smoke E2E: sign in → reach authenticated page → sign out
- `bun run test` and `bun run e2e` scripts in `package.json`
- Lefthook running Vitest on pre-push (not pre-commit — too slow)

**Exit criteria:**
- `bun run test` runs the unit test green
- `bun run e2e` runs the smoke test green against a real Convex dev deployment

**Why last:** Vitest needs the path aliases and module resolution from Phase 1, Playwright needs the app to render and route (Phases 2–4). Scaffolding tests against a half-built app means rewriting them.

---

## Phase 6 — Docs-only

**Goal:** document the deferred integrations so the next developer knows what's *intentionally* missing.

**Create `docs/integrations.md`** covering, for each:
- **Resend** — transactional email. When to install, env vars needed, where the send-email helper would live.
- **Paddle** — payments / Merchant of Record. Webhook route, subscription sync to Convex, env vars.
- **pino** — structured logging. Where to swap `console.log`, log levels, redaction rules.
- **Vercel AI SDK** — LLM features. Model choice, streaming pattern, Convex action wrapper.

**No installs.** This phase is purely Markdown.

**Exit criteria:**
- A new contributor reading `docs/integrations.md` can add any of the four without re-deriving the integration shape.

See [docs/integrations.md](./integrations.md).

---

## Capability defaults (no extra packages)

These are flagged in the spine but worth restating — they do **not** get their own phase:

- **Background jobs** → Convex scheduled functions (`internal.foo.bar` + `ctx.scheduler.runAfter`)
- **Search** → Convex `searchIndex` on the relevant table
- **Vector search** → Convex `vectorIndex` on the relevant table

If you find yourself reaching for BullMQ, Algolia, or Pinecone, stop and check whether Convex covers it first.

---

## What gets committed when

One commit per phase minimum. Within a phase, commit at natural sub-boundaries (e.g. Phase 3: one commit for Convex scaffold, one for WorkOS, one for the bridge). Tag `v0.1` through `v0.6` at the end of each phase so downstream projects can pin to a known-good slice.
