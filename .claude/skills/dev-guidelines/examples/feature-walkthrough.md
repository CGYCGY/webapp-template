# Anatomy of a feature

Every user-data feature in this codebase composes the same six layers. Build a new feature by working through them in order.

```
Zod schema ──► Convex mutation ──► server-layout gate ──► client form ──► edit page ──► unit test
(convex/schemas/)  (convex/)       (app/<route>/layout)  ('use client')  ('use client')  (__tests__/)
```

## 1. Zod schema — single source of truth

`convex/schemas/<feature>.ts`:

```ts
import * as z from 'zod';

export const featureSchema = z.object({
  fieldA: z.string().trim().min(1, 'Required').max(80),
  fieldB: z.string().trim().max(500).optional().default(''),
});

export type FeatureInput = z.input<typeof featureSchema>;
export type FeatureValues = z.output<typeof featureSchema>;
```

The same schema is imported by the client (RHF resolver) and by the Convex mutation (`parseOrThrow`). One file, two consumers.

## 2. Convex table + index

`convex/schema.ts`:

```ts
<feature>: defineTable({
  authId: v.string(),
  fieldA: v.optional(v.string()),
  fieldB: v.optional(v.string()),
  updatedAt: v.optional(v.number()),
}).index('authId', ['authId']),
```

The `authId` index makes `withIndex('authId', q => q.eq('authId', identity.subject))` a single-row lookup instead of a table scan.

## 3. Upsert mutation (first-time create)

`convex/<feature>.ts`:

```ts
import { ConvexError, v } from 'convex/values';
import { parseOrThrow } from './lib/validate';
import { featureSchema } from './schemas/<feature>';

export const create = mutation({
  args: v.object({ fieldA: v.string(), fieldB: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: 'Not authenticated' });
    const parsed = parseOrThrow(featureSchema, args);
    const existing = await ctx.db
      .query('<feature>')
      .withIndex('authId', (q) => q.eq('authId', identity.subject))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...parsed, updatedAt: Date.now() });
      return existing._id;
    }
    return ctx.db.insert('<feature>', {
      authId: identity.subject,
      ...parsed,
      updatedAt: Date.now(),
    });
  },
});
```

Order is non-negotiable: identity guard → `parseOrThrow` → indexed lookup → patch-or-insert. All throws use `ConvexError` (never `new Error`) so the client's `errorMessage` can unwrap them — a bare `Error` reaches the client as an opaque string. Never reach back into `args` after parsing; only `parsed` is sanitized.

## 4. Patch mutation (edit after create)

```ts
export const update = mutation({
  args: v.object({ fieldA: v.string(), fieldB: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: 'Not authenticated' });
    const parsed = parseOrThrow(featureSchema, args);
    const row = await ctx.db
      .query('<feature>')
      .withIndex('authId', (q) => q.eq('authId', identity.subject))
      .unique();
    if (!row) {
      throw new ConvexError({
        message: 'Row not found — has the upstream sync fired?',
      });
    }
    await ctx.db.patch(row._id, { ...parsed, updatedAt: Date.now() });
    return row._id;
  },
});
```

The patch-only mutation **throws** when the row is missing — that's a useful diagnostic, not a bug. Silently inserting would mask the missing-row failure mode.

## 5. Server-layout gate (Layer 2)

`app/<route>/layout.tsx`:

```tsx
import { withAuth } from '@workos-inc/authkit-nextjs';
import { redirect } from 'next/navigation';
import { api } from '@/convex/_generated/api';
import { fetchAuthedQuery } from '@/lib/convex-server';

export default async function FeatureLayout({ children }: { children: React.ReactNode }) {
  const { user } = await withAuth();
  if (!user) redirect('/');
  const row = await fetchAuthedQuery(api.<feature>.getMine, {});
  if (!row?.fieldA) redirect('/<feature>/setup');
  return <>{children}</>;
}
```

`fetchAuthedQuery` attaches the WorkOS access token to a Convex client so the query runs as the authenticated user. Plain `client.query()` runs unauthenticated and silently returns `null`.

## 6. Setup form (client)

`app/<feature>/setup/page.tsx`:

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from 'convex/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { api } from '@/convex/_generated/api';
import { errorMessage } from '@/convex/lib/errorMessage';
import { type FeatureInput, featureSchema } from '@/convex/schemas/<feature>';

export default function FeatureSetup() {
  const router = useRouter();
  const create = useMutation(api.<feature>.create);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<FeatureInput>({
    resolver: zodResolver(featureSchema),
    defaultValues: { fieldA: '', fieldB: '' },
  });
  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await create({ fieldA: values.fieldA, fieldB: values.fieldB ?? '' });
      router.push('/<feature>');
    } catch (err) {
      setSubmitError(errorMessage(err));
    }
  });
  // ... <Form>{...}</Form>, plus a top-level <p role="alert">{submitError}</p>
}
```

Same `featureSchema` as the Convex mutation. Client and server validate identically. `errorMessage` unwraps the mutation's `ConvexError` message; never render `err.message` (opaque in prod).

## 7. Edit form (client, with `form.reset` on load)

```tsx
const row = useQuery(api.<feature>.getMine);

useEffect(() => {
  if (row) form.reset({ fieldA: row.fieldA ?? '', fieldB: row.fieldB ?? '' });
}, [row, form]);
```

`row === undefined` is loading; `row === null` means signed out or not yet synced. Both render fallback messages before the form.

## 8. Unit test — the schema, not the form

`__tests__/<feature>-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { featureSchema } from '@/convex/schemas/<feature>';

describe('featureSchema', () => {
  it('trims fieldA and defaults fieldB to empty string', () => {
    const result = featureSchema.parse({ fieldA: '  hello  ' });
    expect(result.fieldA).toBe('hello');
    expect(result.fieldB).toBe('');
  });

  it('rejects empty fieldA', () => {
    expect(() => featureSchema.parse({ fieldA: '' })).toThrow();
  });
});
```

The schema is the contract that both the client (RHF resolver) and the server (mutation `parse`) depend on. Test it directly; don't mock the form, don't mock Convex.

## Checklist for a new feature

1. `convex/schemas/<feature>.ts` — Zod schema and exported `Input` / `Values` types.
2. `convex/schema.ts` — new table with `.index('authId', ['authId'])` (or your query path).
3. `convex/<feature>.ts` — query + upsert mutation + patch mutation, each with identity guard + `parseOrThrow`; all throws use `ConvexError`.
4. `app/<feature>/layout.tsx` — gate (if the feature has its own URL space).
5. `app/<feature>/setup/page.tsx` — create form.
6. `app/<feature>/page.tsx` — read view; `app/<feature>/edit/page.tsx` — edit form.
7. `__tests__/<feature>-schema.test.ts` — schema tests.

## Why this shape

- **Schema once** — client and server validate identically; no drift.
- **Identity-guarded mutation** — Layer 4 of the auth model is the only thing that protects data.
- **Server-layout gate** — Layer 2 prevents flash-of-wrong-content.
- **Mutation throws on missing row** — diagnostic, not silent corruption.
- **Test the schema, not the form** — covers the contract both sides depend on; fast and reliable.
