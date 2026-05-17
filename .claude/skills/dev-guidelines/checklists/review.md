# Code review checklist

Use this when reviewing any PR in this codebase. Keywords below are the coding-standard shorthand; the cross-reference column points to where the canonical pattern lives.

## Coding standards

| Keyword | What to check | Reference |
|---|---|---|
| DRY | No repeated logic that could collapse into a `lib/` helper or a Convex helper. Two call sites is a hint; three is a smell. | `lib/utils.ts` (`cn()`) |
| KISS | Solution is the most obvious shape. No clever abstractions, no premature factories. | `reference/convex-patterns.md` (query/mutation shapes) |
| YAGNI | No speculative options, props, or env vars. Code does only what the task needs. | — |
| SoC | Proxy / layout / page / Convex handler each do one job. No DB reads in `proxy.ts`. No `withAuth` inside a Convex handler. | `proxy.ts`, `app/<route>/layout.tsx`, `convex/<domain>.ts` |
| Boy Scout | Touched files end cleaner than before — naming, imports, dead code — but only within the diff's scope. | — |
| Fail-Fast | Throw on invalid input *up front*, before any work. Identity guard + Zod `parse()` are the canonical example. | `reference/convex-patterns.md` |
| SOLID-DIP | Layers depend on abstractions, not concretions. The 4-layer model is layered DIP; client UI depends on the Convex API, not the DB row shape. | `docs/auth-layers.md` |
| POLA | New code matches existing patterns. New webhook? Mirror `authKit.events()` in `convex/auth.ts`. New form? Mirror the shape in `reference/forms-and-validation.md`. | — |

## Authorization

- [ ] Every new mutation has `getUserIdentity()` + early throw.
- [ ] Every new mutation that takes user input has `<schema>.parse(args)`.
- [ ] Every new authed page either has its own `layout.tsx` gate or is under one that already gates.
- [ ] `fetchAuthedQuery` is used for Convex reads from Server Components — never `new ConvexHttpClient()` directly (`lib/convex-server.ts`).

## Schemas

- [ ] New Zod schema lives in `convex/schemas/<feature>.ts`.
- [ ] Same schema is consumed by both the form (resolver) and the mutation (`parse`).
- [ ] Both `z.input` and `z.output` types are exported.

## Convex

- [ ] Queries use `.withIndex(...)` — no `.collect()` over a table.
- [ ] Indexes added to `convex/schema.ts` for any new query path.
- [ ] Side effects (network calls) are in `action`, not `mutation`/`query`.
- [ ] Webhook handlers verify signature before dispatching.

## Next.js 16

- [ ] No `middleware.ts` (it's `proxy.ts` in Next 16).
- [ ] No `app/api/*` for business logic.
- [ ] Server actions (`'use server'`) used only for cookies, headers, or server-only SDK calls.
- [ ] No `'use client'` in `layout.tsx` or `route.ts`.
- [ ] Hydration-sensitive UI is mount-gated.

## UI

- [ ] CVA for new primitive variants; `data-slot` set.
- [ ] `cn(...)` for class composition; `className` last.
- [ ] Theme tokens, not hex colors. Dark mode paired.
- [ ] Lucide icons (no inline `<svg>`).
- [ ] Base UI imports preferred over Radix (Slot is the documented exception).

## State

- [ ] No Zustand for single-subtree state — `useState` is enough.
- [ ] Persisted stores use `<project-slug>:` prefix.
- [ ] Persisted reads go through a mount-gated selector.

## Env

- [ ] New env vars added to `env.ts` server vs client correctly. Secrets never in client.
- [ ] `.env.local.example` updated.
- [ ] `just env-sync` run if Convex needs the new var.

## Testing

- [ ] Schemas have unit tests.
- [ ] E2E updated for any auth / navigation / persistence change.

## Style / hygiene

- [ ] Biome passes (`just check`).
- [ ] No comments that just restate the code.
- [ ] No `console.log` left behind.
- [ ] Commit messages use the conventional `<emoji> <type>(<scope>): <description>` format with a body in flat bullets.

## Red flags that should block review

- A new mutation without identity guard.
- A new mutation without Zod `parse`.
- `process.env.X` outside `env.ts`.
- `client.query(...)` without `setAuth` for an authed Convex call.
- New `middleware.ts` (it's `proxy.ts`).
- A persisted Zustand store with no prefix.
- A schema duplicated in two files.
