# Integrations

This template ships with three installed integrations (Sentry, PostHog, Cloudflare R2) and documents four deferred ones (Resend, Paddle, pino, Vercel AI SDK) as recipes for later. Installed integrations are wired into the codebase and gated by env vars; deferred integrations are not in `package.json` until you install them.

For each entry, this doc lists **when** to install, **what** env vars are needed, **where** the code lives, and **how** it slots into the existing patterns (Convex mutations / actions / HTTP routes, `env.ts`, `lib/`).

---

## Installed

### Sentry — crash + performance reporting

- **When to install:** shipped with the template. Active when `SENTRY_DSN` is set.
- **Install:** already in deps (`@sentry/nextjs`).
- **Env vars** (`env.ts` server block: `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` — all optional; client block: `NEXT_PUBLIC_SENTRY_DSN`, optional).
- **Where the code lives:**
  - `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` — DSN-gated init per runtime.
  - `instrumentation.ts` — wires server/edge configs via `NEXT_RUNTIME`; re-exports `Sentry.captureRequestError` as `onRequestError`.
  - `app/global-error.tsx` — root App Router error boundary, calls `Sentry.captureException`.
  - `next.config.ts` — wrapped with `withSentryConfig(...)` for sourcemap upload + tunnel route.
- **Pattern:** errors auto-captured client-side and via instrumentation server-side. For manual capture: `import * as Sentry from '@sentry/nextjs'; Sentry.captureException(error)`. Build-time sourcemap upload requires `SENTRY_AUTH_TOKEN` as a CI secret. See `docs/sentry.md` for full setup.

### PostHog — product analytics

- **When to install:** shipped with the template. Inactive until `NEXT_PUBLIC_POSTHOG_KEY` is set.
- **Install:** already in deps (`posthog-js`, `posthog-node`).
- **Env vars** (`env.ts` client block: `NEXT_PUBLIC_POSTHOG_KEY` required, `NEXT_PUBLIC_POSTHOG_HOST` optional with default `https://us.i.posthog.com`).
- **Where the code lives:**
  - `lib/posthog/client.tsx` — `'use client'` `<PostHogProvider>`, init in `useEffect`, pageview capture configured.
  - `lib/posthog/server.ts` — `posthog-node` singleton via `getPostHogServer()`. Caller must `await client.shutdown()` in long-lived Node contexts.
  - `lib/posthog/identify.ts` — `identifyUserOnSignIn(user)` and `resetPostHogOnSignOut()` helpers.
  - `lib/posthog/identity-bridge.tsx` — shipped `<PostHogIdentityBridge />` (mounted in `components/convex-client-provider.tsx`); watches `useAuth()` and fires identify/reset on the sign-in/sign-out transitions, plus self-provisions the Convex user row via `api.users.bootstrapSelf`.
  - `app/PostHogPageView.tsx` — App Router pathname/searchParams listener, captures `$pageview` (the sole pageview source; init sets `capture_pageview: false`).
  - `app/layout.tsx` — wrapped in `<PostHogProvider>`.
- **Pattern:** call `posthog.capture('event_name', { props })` from any client component; server-side `getPostHogServer().capture(...)` for server actions / route handlers. Identify on sign-in to enable cross-device user tracking. See `docs/posthog.md`.

### Cloudflare R2 — file storage

- **When to install:** shipped with the template. Inactive until `R2_*` env vars are set on Convex (`npx convex env set R2_ACCOUNT_ID ...`).
- **Install:** already in deps (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`).
- **Env vars:** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (required), `R2_PUBLIC_BASE_URL` (optional). Set via `npx convex env set` — these live in **Convex runtime**, NOT in `env.ts` (Next.js app never sees them).
- **Where the code lives:**
  - `convex/r2.ts` — `'use node'` action exports `generatePresignedPutUrl` (5min) and `generatePresignedGetUrl` (1h). Auth-gated via `ctx.auth.getUserIdentity()`, then keys are scoped to the caller's `uploads/<convex userId>/` prefix (client-supplied keys outside it are rejected) — see `docs/r2.md` "Key scoping".
  - `lib/r2/upload.ts` — `useR2Upload()` hook. Returns async `({ file, contentType?, key? }) => { key, etag? }`. Uses `useAction` + browser `fetch` PUT.
  - `lib/r2/download.ts` — `useR2Url()` hook. Async `(key) => url`.
- **Pattern:** client calls `useR2Upload()` hook → Convex action mints presigned PUT URL → browser PUTs file directly to R2 → client stores returned key in Convex via a separate mutation. Bucket CORS must allow PUT/GET from app origins; see `docs/r2.md`.

---

## Deferred

### Resend — transactional email

**When to install:** the moment you need to send an email the user didn't initiate themselves in the same request (welcome email after sign-up, password reset, payment receipt, weekly digest). For form-confirmation toasts and inline UI, no email is needed.

**Install:**

```sh
bun add resend
```

**Env vars** (add to both `env.ts` and `.env.local`, then `just convex-env-sync` so Convex sees them):

```ts
// env.ts → server block
RESEND_API_KEY: z.string().min(1),
RESEND_FROM_EMAIL: z.email(),
```

`RESEND_API_KEY` is server-only. Never expose it client-side. The "from" address must be on a domain you've verified in the Resend dashboard.

**Where the code lives:**

- `lib/email.ts` — a single `sendEmail({ to, subject, react })` helper. Wraps the Resend client and reads from `env`. One module, one entry point — any future provider swap (SES, Postmark) replaces this file alone.
- `emails/` — React Email templates as `.tsx` files. One file per template (`welcome.tsx`, `password-reset.tsx`). Use [`react-email`](https://react.email/) if you want a preview server; otherwise the templates render to HTML strings at send time.
- **Convex actions, not mutations.** Email sending is a network call to a third-party API — it must run in a Convex `action`, not a query/mutation. Create `convex/emails.ts` exporting `sendWelcome = action({ ... })` and call it via `ctx.scheduler.runAfter(0, internal.emails.sendWelcome, { ... })` from the mutation that should trigger it. Scheduling decouples the email from the mutation's transactional success/failure.

**Trigger pattern:**

```ts
// inside a mutation, after the row is created
await ctx.scheduler.runAfter(0, internal.emails.sendWelcome, {
  userId: id,
});
```

**Webhooks:** Resend can POST delivery/bounce events to a webhook URL. If you wire that, add the route at `convex/http.ts` (mirror the WorkOS webhook pattern in `convex/auth.ts`) and store events in a `emailEvents` table for audit. Skip this for v1 — most apps don't need delivery tracking.

---

### Paddle — payments / Merchant of Record

**When to install:** the day you charge real money. For "soft" paid tiers gated by a boolean flag, you can stub this; for anything that touches taxes, refunds, or chargebacks, install. Paddle as MoR means they handle global VAT/sales tax — that is the reason to pick them over Stripe for a small team.

**Install:**

```sh
bun add @paddle/paddle-node-sdk
```

(For client-side checkout: also `@paddle/paddle-js`.)

**Env vars:**

```ts
// env.ts → server block
PADDLE_API_KEY: z.string().min(1),
PADDLE_WEBHOOK_SECRET: z.string().min(1),
PADDLE_ENVIRONMENT: z.enum(['sandbox', 'production']),

// env.ts → client block (for the checkout overlay)
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: z.string().min(1),
NEXT_PUBLIC_PADDLE_ENVIRONMENT: z.enum(['sandbox', 'production']),
```

Run `just convex-env-sync` to push the server vars to Convex (the webhook handler needs them).

**Where the code lives:**

- `lib/paddle.ts` — server-side Paddle SDK singleton, mirrors `lib/convex-server.ts`. Server-only (`import 'server-only'`).
- `app/billing/page.tsx` — the upgrade/manage-subscription page. Uses `@paddle/paddle-js` to open the hosted checkout overlay.
- **Convex tables** (add to `convex/schema.ts`):
  - `subscriptions`: `{ userId, paddleSubscriptionId, status, priceId, currentPeriodEnd, ... }`, indexed by `userId` and `paddleSubscriptionId`.
  - Don't store payment-method or card data. Paddle keeps that.
- **Webhook route:** add to `convex/http.ts`, mirroring how `authKit.registerRoutes(http)` is wired in. The handler lives in `convex/paddle.ts` exporting an `httpAction`. It verifies the signature against `PADDLE_WEBHOOK_SECRET`, parses the event, and upserts the `subscriptions` row. Subscription state lives in Convex, not Paddle — read it from there for entitlement checks.

**Entitlement check pattern:**

```ts
// query helper in convex/subscriptions.ts
export const isActive = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const sub = await ctx.db
      .query('subscriptions')
      .withIndex('userId', (q) => q.eq('userId', userId))
      .unique();
    return sub?.status === 'active';
  },
});
```

Server-side gates call this in mutations; client-side gates call it via `useQuery` for UI affordances. Never trust the client-side result for authorization — re-check in the mutation.

---

### pino — structured logging

**When to install:** when grepping `console.log` in production logs stops scaling. In practice, around the point you have more than one developer or you wire a log shipper (Datadog, Loki, Better Stack). Until then, `console.log` is fine.

**Install:**

```sh
bun add pino
bun add -D pino-pretty
```

**Env vars:**

```ts
// env.ts → server block
LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
```

**Where the code lives:**

- `lib/logger.ts` — exports a configured `logger`. In dev, pipes through `pino-pretty` for human-readable output; in production, raw JSON to stdout. One module, one entry point.
- **Swap `console.log` for `logger.info` / `logger.warn` / `logger.error`** throughout `convex/` and `app/`. Current call sites to migrate (as of this writing): `convex/auth.ts:27` and `convex/auth.ts:41` — both are `console.warn` on missing user rows during WorkOS webhook handling.
- **Redaction:** configure pino's `redact` option to strip `password`, `token`, `accessToken`, `authorization`, `cookie`. Once in `lib/logger.ts`, every call site inherits it.

**Convex caveat:** Convex queries and mutations run in a sandboxed V8 isolate. pino works there but its transport features (file output, network shippers) don't — log to stdout only and let the Convex dashboard collect logs. For Convex actions (which run in Node), full pino features are available.

**Log-level convention:**

- `error` — something failed that needs human attention.
- `warn` — recoverable surprise (the `user not found` cases in `convex/auth.ts` are correct examples).
- `info` — business events worth keeping (sign-up completed, subscription started). Sparingly.
- `debug` — diagnostic detail for local development. Off in production.

---

### Vercel AI SDK — LLM features

**When to install:** the moment a feature needs an LLM in the request path (chat UI, generate-from-prompt, structured extraction). Don't install to "be ready for AI features later" — it's a stack the moment you commit to it.

**Install:**

```sh
bun add ai @ai-sdk/anthropic
```

Pick the provider package matching the model you've chosen. Anthropic is the default for this template; `@ai-sdk/openai`, `@ai-sdk/google`, and `@ai-sdk/azure` are drop-in replacements at the import level. The streaming API is provider-agnostic.

**Env vars:**

```ts
// env.ts → server block
ANTHROPIC_API_KEY: z.string().min(1),
```

Server-only. The streaming endpoint runs on the server; the client never sees the key. Push to Convex with `just convex-env-sync` if you call the LLM from a Convex action.

**Where the code lives:**

- `lib/ai.ts` — module-level `model` constant pointing at the chosen Anthropic model. **Default to `claude-sonnet-4-6` for production features; `claude-haiku-4-5-20251001` for low-latency tasks.** Centralizing the model choice means upgrading models is a one-line change.
- **Server route**, not a client-side fetch. Either:
  - **Next.js route handler** (`app/api/chat/route.ts`) for in-request streaming responses to the UI. Use `streamText({ model, messages })` and return the result with `result.toDataStreamResponse()`.
  - **Convex action** (`convex/ai.ts` exporting `generate = action({ ... })`) when the LLM call is part of a background workflow (summarize after webhook, embed and store, etc.). Convex actions run in Node, so the full Vercel AI SDK works there.
- **Client side** — `useChat()` or `useCompletion()` from `ai/react`. These hooks handle the streaming SSE protocol automatically; don't roll your own `fetch` + `ReadableStream` reader.

**Streaming pattern (Next.js route):**

```ts
// app/api/chat/route.ts
import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { withAuth } from '@workos-inc/authkit-nextjs';

export async function POST(req: Request) {
  const { user } = await withAuth({ ensureSignedIn: true });
  const { messages } = await req.json();
  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    messages,
  });
  return result.toDataStreamResponse();
}
```

**Vector search** — if you need RAG, use Convex's built-in `vectorIndex`. Embed with `embed()` from the AI SDK inside a Convex action, store the vector on the row, query with `ctx.db.query(...).withSearchIndex(...)`. Don't add Pinecone.

---

## Checklist when installing a new integration

1. Add env vars to `env.ts` (server vs client block matters — server keys never appear in the client bundle).
2. Add the same vars to `.env.local`; if Convex needs them, `just convex-env-sync`.
3. Create the `lib/<integration>.ts` helper so there's exactly one entry point.
4. Wire the appropriate Convex layer:
   - **Email, AI background jobs** → Convex action, optionally `ctx.scheduler.runAfter`.
   - **Payments webhooks** → Convex HTTP route via `httpRouter`.
   - **Logging** → no Convex wiring; the helper is consumed in-place.
5. If the integration sends webhooks, mirror the WorkOS pattern in `convex/auth.ts` + `convex/http.ts` for signature verification and event dispatch.
6. Add an entry under `## Installed` here, plus a stack-table row in `.claude/skills/dev-guidelines/SKILL.md` and a one-liner in `.claude/skills/dev-guidelines/decisions.md`.
