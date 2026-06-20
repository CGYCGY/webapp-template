# Convex patterns

## Canonical mutation shape

Every mutation that takes user input follows this skeleton:

```ts
import { ConvexError, v } from 'convex/values';
import { mutation } from './_generated/server';
import { parseOrThrow } from './lib/validate';
import { featureSchema } from './schemas/<feature>';

export const doThing = mutation({
  args: v.object({
    fieldA: v.string(),
    fieldB: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: 'Not authenticated' });

    const parsed = parseOrThrow(featureSchema, args);

    const existing = await ctx.db
      .query('<table>')
      .withIndex('authId', (q) => q.eq('authId', identity.subject))
      .unique();

    // patch existing or insert new — never use `args` after `parse`, only `parsed`
    if (existing) {
      await ctx.db.patch(existing._id, { ...parsed, updatedAt: Date.now() });
      return existing._id;
    }
    return ctx.db.insert('<table>', {
      authId: identity.subject,
      ...parsed,
      updatedAt: Date.now(),
    });
  },
});
```

Two non-negotiables in every mutation that takes user input:

1. `ctx.auth.getUserIdentity()` + early `throw new ConvexError({ message })` — Layer 4 identity check. Never `throw new Error(...)` (see error contract below).
2. `const parsed = parseOrThrow(featureSchema, args)` — Zod re-validation. The Convex `v.object(...)` validator checks shape; Zod checks business rules (length, trim, regex, default). NEVER `featureSchema.parse(args)` — that throws a raw `ZodError`, which Convex redacts to a generic "Server Error" in prod.

After `parseOrThrow`, never reach back into `args`. Only `parsed` is sanitized.

## Error contract: `parseOrThrow` → `ConvexError` → client `errorMessage()`

Convex redacts a plain `throw new Error(...)` to "Server Error" in production. Only `ConvexError` payloads cross the wire to the client. So every thrown error a user should see — auth guards AND validation — must be a `ConvexError`.

- **Validation:** `parseOrThrow(schema, args)` (`convex/lib/validate.ts`) throws `ConvexError({ kind: 'validation', field, message, issues })` where `field`/`message` are the first failing issue and `issues` is the full list.
- **Guards / not-found:** `throw new ConvexError({ message: '...' })` — auth, missing rows, prefix checks.
- **Client read:** `errorMessage(err)` (`convex/lib/errorMessage.ts`) detects `ConvexError` by `Symbol.for('ConvexError')` brand (not `instanceof` — client may resolve a different `convex` copy), returns `err.data.message`, else a generic fallback. Use it in `catch` blocks / form `onError`.

## Canonical query shape

```ts
import { query } from './_generated/server';

export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return ctx.db
      .query('<table>')
      .withIndex('authId', (q) => q.eq('authId', identity.subject))
      .unique();
  },
});
```

Queries that return user-scoped data return `null` for unauthenticated callers (so client UI can handle "signed out" without an exception). Queries that read public data can skip the identity guard, but must not read private fields.

## Upsert vs patch — pick the right shape

| Mutation kind | When | What to do if the row is missing |
|---|---|---|
| Upsert (insert-or-patch) | Caller may not have a row yet — e.g. first-time onboarding | Insert |
| Patch-only | Caller is gated behind a layout that guarantees the row exists | **Throw** with a diagnostic message |

Do not conflate them. A patch-only mutation throwing "User row not found — webhook has not synced yet" is a useful diagnostic; silently inserting would mask the bug.

## Indexing rule

Every `.query('table')` chain must use `.withIndex(...)`. No `.collect()` over a whole table, no full scans. If you need a new query path, add the index to `convex/schema.ts`:

```ts
defineTable({ /* fields */ }).index('authId', ['authId'])
```

## AuthKit webhook events

```ts
// convex/auth.ts
export const { authKitEvent } = authKit.events({
  'user.created': async (ctx, event) => {
    // Idempotent: withIndex existence check + early return before insert.
    // Pairs with users.bootstrapSelf (also idempotent) so webhook + JIT
    // provisioning can't race into duplicate rows.
    const existing = await ctx.db
      .query('users')
      .withIndex('authId', (q) => q.eq('authId', event.data.id))
      .unique();
    if (existing) return;
    await ctx.db.insert('users', { authId: event.data.id, /* email, name */ });
  },
  'user.updated': async (ctx, event) => { /* withIndex lookup, then patch */ },
  'user.deleted': async (ctx, event) => { /* withIndex lookup, then delete */ },
});
```

The events run in a Convex mutation context — they have full `ctx.db` access but **no** `ctx.auth` (the webhook is server-to-server, not user-driven). Use the WorkOS event payload's `event.data.id` as the `authId`.

`user.created` must be idempotent (existence check before insert) — the webhook fires out-of-band and `users.bootstrapSelf` may insert the same row first. See `examples/auth-bridge.md`.

For a new provider's webhook (Paddle, Resend, etc.), mirror this shape. Register routes on the HTTP router via `convex/http.ts`.

## HTTP router

```ts
// convex/http.ts
import { httpRouter } from 'convex/server';
import { authKit } from './auth';
const http = httpRouter();
authKit.registerRoutes(http);
export default http;
```

To add a custom webhook receiver:

```ts
import { httpAction } from './_generated/server';
http.route({
  path: '/<provider>/webhook',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const body = await req.text();
    // 1. Verify signature against <PROVIDER>_WEBHOOK_SECRET
    // 2. ctx.runMutation(internal.<provider>.handleEvent, { ... })
    return new Response(null, { status: 200 });
  }),
});
```

The webhook URL on the deployed Convex instance is `https://<deployment>.convex.site/<path>`.

## Side effects: use actions

Convex queries and mutations are deterministic and cannot make external network calls. For anything that talks to a third-party API (email send, payment SDK, LLM call), use `action({ ... })`.

Trigger a side effect from a mutation via the scheduler:

```ts
await ctx.scheduler.runAfter(0, internal.emails.sendWelcome, { userId });
```

This decouples the side effect from the mutation's transactional success.

### `'use node'` actions

Use `'use node'` at the top of a Convex file when the action requires a Node runtime feature (file system, `@aws-sdk/*`, native Node modules). Without it, actions run in the V8 isolate — faster, but no Node API.

Canonical example: `convex/r2.ts` — uses `@aws-sdk/client-s3` to mint presigned URLs scoped to the caller.

```ts
'use node';

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import { action } from './_generated/server';

export const generatePresignedPutUrl = action({
  args: { contentType: v.string(), key: v.optional(v.string()) },
  handler: async (ctx, { contentType, key }): Promise<{ url: string; key: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: 'Not authenticated' });

    // Resolve the caller's row via an internalQuery — node actions have no db.
    // NEVER a public query (cross-user PII read).
    const user = await ctx.runQuery(internal.users.getByAuthIdInternal, {
      authId: identity.subject,
    });
    if (!user) throw new ConvexError({ message: 'User row not found' });

    // Scope keys to uploads/<user._id>/ so a caller can't sign for another
    // user's object. Reject any client-supplied key outside the prefix.
    const expectedPrefix = `uploads/${user._id}/`;
    if (key !== undefined && !key.startsWith(expectedPrefix)) {
      throw new ConvexError({ message: 'Key must be under your uploads prefix' });
    }
    const objectKey = key ?? `${expectedPrefix}${crypto.randomUUID()}`;
    // ... build S3Client, sign PutObjectCommand(Key: objectKey), return { url, key: objectKey }
  },
});
```

The GET path (`generatePresignedGetUrl`) takes a required `key` and enforces the SAME `uploads/<user._id>/` prefix check before signing — caller-scoping applies on both PUT and GET.

Rules:

- `'use node'` files can only export `action` and `httpAction`. Queries and mutations stay in V8-isolate files.
- Auth-gate every action: `ctx.auth.getUserIdentity()` then `throw new ConvexError(...)` if absent.
- Node actions have no `ctx.db` — resolve the caller's row with `ctx.runQuery(internal.users.getByAuthIdInternal, ...)` (an `internalQuery`), never a public query.
- Scope every signed key to the caller's `uploads/<user._id>/` prefix and reject keys outside it, on both PUT and GET.
- Read env via `process.env.R2_*` (Convex runtime). Do NOT add Convex-only env vars to `env.ts`.

## Diagnostic queries

Add a `whoami`-style query that intentionally throws when there is no identity, so a broken JWT bridge surfaces immediately rather than silently returning `null` from downstream queries. Wrap the consuming page in an error boundary (see `reference/architecture.md` → Error handling).

## `_generated`

`convex/_generated/` is regenerated by `bunx convex dev`. Never edit by hand. The `api` and `internal` namespaces are imported across both client (`@/convex/_generated/api`) and server (`@/convex/_generated/server`).

`tsconfig.json` excludes `convex/` from the Next type project, so unit tests cannot import Convex `_generated` types. Test pure modules instead (e.g. schemas).
