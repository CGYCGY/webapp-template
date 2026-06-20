# Pre-commit validation checklist

Run through this before every commit. If a row doesn't apply to the change, skip it.

## Auth & authorization

- [ ] **Layer 1**: no change to `proxy.ts` unless deliberately altering session handling.
- [ ] **Layer 2**: every new authed route segment has its own `layout.tsx` or extends an existing layout that gates with `withAuth` + `fetchAuthedQuery` (`lib/convex-server.ts`).
- [ ] **Layer 4 (non-negotiable)**: every new mutation calls `ctx.auth.getUserIdentity()` and throws if absent.
- [ ] **Layer 4 (non-negotiable)**: every mutation that accepts user input calls `parseOrThrow(schema, args)` (`convex/lib/validate.ts`) before any DB write.
- [ ] User-meaningful / auth throws use `throw new ConvexError({ message })`, never `throw new Error(...)` (plain Error redacts to "Server Error" in prod).
- [ ] Client mutation/query catches surface `errorMessage(err)` (`@/convex/lib/errorMessage`), never raw `err.message`.
- [ ] `'use node'` actions resolve the caller via an `internalQuery` (`getByAuthIdInternal`), not a public query.
- [ ] R2 / file-upload presigned keys scoped to the caller (`uploads/<userId>/`); foreign keys rejected on both PUT and GET.

## Forms & schemas

- [ ] New Zod schema lives in `convex/schemas/<feature>.ts`, not inline in the route.
- [ ] Schema exports both `z.input` and `z.output` types.
- [ ] Form uses `useForm<...Input>({ resolver: zodResolver(schema), defaultValues })`.
- [ ] Field errors render via `<FormMessage />`; submit-level errors via `<p role="alert">`.
- [ ] Optional text inputs use `value={field.value ?? ''}` to stay controlled.
- [ ] Number inputs use `valueAsNumber` (or convert in `onChange`).
- [ ] Submit button shows `disabled={form.formState.isSubmitting}` and a "Saving…" label.

## Convex

- [ ] New table in `convex/schema.ts` has the index(es) it'll be queried by; no `.collect()` without an index.
- [ ] Mutation uses `args: v.object({...})` for the Convex validator **plus** `parseOrThrow(schema, args)` for business rules.
- [ ] Upsert vs patch: insert-or-patch for first-touch flows; patch-only (throws on missing row) for edits behind a gate — picked deliberately.
- [ ] Side effects (email, third-party API) live in `action`, never in a mutation. Trigger via `ctx.scheduler.runAfter`.
- [ ] New webhook receiver is an `httpAction` registered on `convex/http.ts`, mirroring `authKit.registerRoutes`.

## Components & UI

- [ ] Server vs client placement: layouts and `route.ts` stay server-side; only interactive leaves have `'use client'`.
- [ ] Hydration-sensitive UI (Zustand persist read, `next-themes` read) is mount-gated.
- [ ] New primitive wraps a Base UI component (or Radix where Base UI lacks one), CVA-wrapped, with `data-slot`.
- [ ] `cn(...)` is used for class composition; `className` is last so caller overrides win.
- [ ] Icons are Lucide, sized `size-4` unless there's a reason.
- [ ] Light/dark variants are paired in CVA (e.g. `bg-foo dark:bg-bar`).
- [ ] No raw hex colors — only theme tokens.

## State

- [ ] No new Zustand store for state that lives in one component subtree — use `useState`.
- [ ] New persisted store uses `<project-slug>:<concern>` as the storage `name`.
- [ ] Persisted reads go through a mount-gated selector hook.

## Env

- [ ] New env var added to `env.ts` under the correct block (server vs client — secrets never in client).
- [ ] New env var added to `runtimeEnv` mapping in `env.ts`.
- [ ] New env var added to `.env.local` and `.env.local.example`.
- [ ] If used by Convex: `just env-sync` run (and prefix added to `SYNC_PREFIXES` if not `WORKOS_`).
- [ ] If used at build time and `NEXT_PUBLIC_*`: `ARG`/`ENV` lines added to `deploy/Dockerfile`.

## Tests

- [ ] New Zod schema has a `__tests__/<feature>-schema.test.ts` with valid, invalid, and boundary cases.
- [ ] Pure helper added to `lib/` has a unit test.
- [ ] E2E flow updated if the change touches auth, navigation, or persisted state.
- [ ] Test files don't import from `@/convex/_generated/*` (excluded by `tsconfig.json`).

## Tooling

- [ ] `just check` passes (Biome lint + format + organize imports).
- [ ] `just typecheck` passes.
- [ ] `just test` passes.
- [ ] (For UI changes) `just e2e` passes locally with `.env.test` populated.

## Commit hygiene

- [ ] No `console.log` left in the diff (replace with `logger` if pino is installed).
- [ ] No commented-out code or `TODO` without a tracker reference.
- [ ] No new top-level `node_modules`-style dependency without a corresponding `bun add` and an updated `bun.lock`.
- [ ] No emoji in source files.
- [ ] No Co-Authored-By lines in commit messages.

Lefthook enforces Biome pre-commit; pre-push runs `bun run typecheck` and Vitest in parallel (`lefthook.yml`). If a pre-commit hook fails, fix the issue and create a **new** commit — never amend the failed one.
