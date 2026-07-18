# Integration add checklist

This codebase intentionally ships without Resend, Paddle, pino, or Vercel AI SDK. Recipes for adding any of them are in `docs/integrations.md`. This checklist is the procedure for following one of those recipes — or for adding a fifth integration after writing its recipe.

## Pre-flight

- [ ] Read the relevant section of `docs/integrations.md` (any deferred integration).
- [ ] Confirm the trigger is real. "Be ready for X later" is not a trigger; "we need to send a welcome email" is.
- [ ] If adding a new deferred integration, write its `docs/integrations.md` section **first** (when / env / where / how), then start the checklist.

## 1. Env vars

- [ ] Add new vars to `env.ts` under the correct block:
  - Server-only secrets (API keys, signing secrets) → `server` block.
  - Anything inlined into the client bundle → `client` block with `NEXT_PUBLIC_` prefix.
- [ ] Add the same keys to `runtimeEnv` map in `env.ts`.
- [ ] Add real values to `.env.local`.
- [ ] Add placeholders to `.env.local.example`.
- [ ] If Convex needs the var: extend `SYNC_PREFIXES` in `justfile` and run `just convex-env-sync`.
- [ ] If `NEXT_PUBLIC_*` and needed at build time: add `ARG`/`ENV` lines to `deploy/Dockerfile` and pass through `deploy/deploy.sh`.

## 2. Helper module

- [ ] Create `lib/<integration>.ts` (single file) OR `lib/<integration>/` (subdir with `index.ts` barrel) when client/server split or multiple concerns force it. Example: `lib/posthog/` (client/server split), `lib/r2/` (upload + download).
- [ ] Add `import 'server-only';` if it uses server-only secrets (mirrors `lib/convex-server.ts`).
- [ ] Export named functions (`sendEmail`, `getSubscription`, etc.). No default export.
- [ ] Reads env via `import { env } from '@/env'`, never `process.env`.

## 3. Convex wiring (pick the right layer)

- [ ] **Side effect from a user action (email, AI, payments API call)** → Convex `action` in `convex/<integration>.ts`. Trigger from a mutation via `ctx.scheduler.runAfter(0, internal.<integration>.<fn>, args)`.
- [ ] **Inbound webhook** → Convex `httpAction` in `convex/<integration>.ts`. Register on `convex/http.ts` mirroring `authKit.registerRoutes(http)`. Verify signature against the provider's webhook secret **before** dispatching.
- [ ] **Logging** → no Convex wiring; the helper is consumed in-place.
- [ ] **New persisted state** (subscriptions, email events, etc.) → add a table to `convex/schema.ts` with the index(es) you'll query by.

## 4. Client wiring (if any)

- [ ] New UI surface follows the existing route conventions (`app/<route>/layout.tsx` + `page.tsx`, gated where needed).
- [ ] Forms use the shadcn `<Form>` stack with a Zod schema in `convex/schemas/`.
- [ ] State reads from `useQuery`, mutations via `useMutation`. No new fetch helpers.

## 5. Tests

- [ ] New Zod schema has a unit test in `__tests__/<feature>-schema.test.ts`.
- [ ] If the integration adds an authed flow, extend or add an E2E in `e2e/`.

## 6. Docs

- [ ] Update the integration's row in `docs/integrations.md` — if it was previously "Deferred," move it to "Installed" and link to `lib/<integration>.ts` and `convex/<integration>.ts`.
- [ ] If it changes the standing decisions, add or update an entry in `decisions.md`.

## Provider-specific gotchas (from `docs/integrations.md`)

| Integration | Watch out for |
|---|---|
| Resend | "From" email must be on a verified domain. Send via Convex `action`, not mutation. Decouple via `scheduler.runAfter`. |
| Paddle | MoR — they handle taxes. Don't store payment-method data. Webhook signature uses `PADDLE_WEBHOOK_SECRET`. Entitlement checks via Convex query, not client state. |
| pino | Sandboxed in Convex V8 isolates — transports don't work in queries/mutations, only in actions. Use the `redact` option to strip secrets centrally. |
| Vercel AI SDK | Anthropic is the default provider. Model constant in `lib/ai.ts`. Stream from a route handler or a Convex `action`. |
| Sentry | DSN-gated init — template builds without it. Source-map upload needs `SENTRY_AUTH_TOKEN` as a CI secret. Use `app/global-error.tsx` not `error.tsx` for root boundary. |
| PostHog | `getPostHogServer()` needs explicit `await client.shutdown()` in long-lived Node contexts. Identify on sign-in via `lib/posthog/identify.ts`. |
| Cloudflare R2 | Env vars live in Convex runtime (`npx convex env set`), NOT in `env.ts`. Bucket CORS must allow PUT from app origin. Client uploads direct to R2, never proxies through Convex. |

## Pitfalls

- Sending an email *inside* a Convex mutation will fail — mutations can't make network calls. Schedule an action.
- Putting a payment SDK secret in the `client` block of `env.ts` will leak it to the browser bundle.
- Adding a webhook handler without signature verification is a CSRF vector. Always verify before doing any DB write.
- Adding `LOG_LEVEL` to client env. Logging is server-side; the client doesn't need that var.
