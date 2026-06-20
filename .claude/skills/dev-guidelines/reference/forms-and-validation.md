# Forms & validation

## Schema location

All Zod schemas live in `convex/schemas/<feature>.ts`. One schema per feature. Both the React form and the Convex mutation import the same module.

```ts
// convex/schemas/<feature>.ts
import * as z from 'zod';

export const featureSchema = z.object({
  fieldA: z.string().trim().min(1, 'Required').max(80),
  fieldB: z.string().trim().max(500).optional().default(''),
});

export type FeatureInput = z.input<typeof featureSchema>;
export type FeatureValues = z.output<typeof featureSchema>;
```

Always export both `z.input` (the form's value type — optionals are still optional) and `z.output` (post-parse type — optionals with `.default()` are required). Use `z.input` for the RHF generic; use `z.output` when reading parsed values.

## React Hook Form wiring

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from 'convex/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { api } from '@/convex/_generated/api';
import { errorMessage } from '@/convex/lib/errorMessage';
import { type FeatureInput, featureSchema } from '@/convex/schemas/<feature>';

export function FeatureForm() {
  const doThing = useMutation(api.<feature>.doThing);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<FeatureInput>({
    resolver: zodResolver(featureSchema),
    defaultValues: { fieldA: '', fieldB: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await doThing({ fieldA: values.fieldA, fieldB: values.fieldB ?? '' });
    } catch (err) {
      setSubmitError(errorMessage(err));
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="grid gap-4">
        <FormField
          control={form.control}
          name="fieldA"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Field A</FormLabel>
              <FormControl><Input autoComplete="off" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {submitError ? (
          <p role="alert" className="text-sm font-medium text-destructive">{submitError}</p>
        ) : null}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Saving…' : 'Submit'}
        </Button>
      </form>
    </Form>
  );
}
```

Two error channels:

- **Field errors** — `<FormMessage />` inside each `<FormItem>`, wired by `useFormField` inside `components/ui/form.tsx`.
- **Submit errors** — top-level `<p role="alert">` with destructive styling, near the submit button. Always `setSubmitError(errorMessage(err))` from `@/convex/lib/errorMessage` — never render `err.message`. A raw `ConvexError.data.message` is only readable when thrown intentionally; an uncaught throw reaches the client as a redacted/opaque string in prod. `errorMessage` brand-checks the ConvexError (via `Symbol.for('ConvexError')`, so a duplicate `convex` copy still matches), unwraps `data.message`, and falls back to a generic line.

## Editing-flow pattern

For edit pages (vs first-time create), seed `defaultValues` from the loaded row using `form.reset()` inside an effect once data arrives:

```tsx
useEffect(() => {
  if (row) form.reset({ fieldA: row.fieldA ?? '', fieldB: row.fieldB ?? '' });
}, [row, form]);
```

Guard against `row === undefined` (loading) and `row === null` (signed out / not yet synced) before rendering the form.

## Server-side re-validation

Convex mutations MUST re-parse with the same Zod schema via `parseOrThrow` (`convex/lib/validate.ts`), never `schema.parse()`:

```ts
import { parseOrThrow } from './lib/validate';

const parsed = parseOrThrow(featureSchema, args);
```

`parseOrThrow` does a `safeParse` and on failure throws `ConvexError({ kind: 'validation', field, message, issues })` — a structured error the client's `errorMessage` can unwrap. A bare `schema.parse()` throws a `ZodError` that surfaces as an opaque string on the client. User-facing/auth failures throw `new ConvexError({ message })`, never `new Error()`.

`v.object({...})` is the Convex arg validator — it enforces shape and types but not business rules. `parseOrThrow` enforces `min`, `max`, `trim`, regex, `.default()`, etc. Both are needed.

A client that bypasses the form can hit the mutation directly through the browser console — see `docs/auth-layers.md`. Server-side validation is the only protection.

## shadcn `Form` primitives

`components/ui/form.tsx` exports:

| Primitive | Job |
|---|---|
| `Form` | Re-export of RHF's `FormProvider` |
| `FormField` | Wraps RHF's `Controller`, supplies field context |
| `FormItem` | Layout wrapper, generates `id` for label / control / message |
| `FormLabel` | `<Label>` wired to the form item id, marks error state |
| `FormControl` | `@radix-ui/react-slot` `<Slot>` that forwards `id` and `aria-*` |
| `FormDescription` | Optional helper text under the control |
| `FormMessage` | Renders Zod error message, or children if no error |

Always wrap inputs in this stack — it's what supplies the `aria-invalid`, `aria-describedby`, and label-for relationships.

## Input types — gotchas

- **Number inputs** — use `valueAsNumber: true` in `register` or convert in `onChange`. RHF gives strings by default for `<input type="number">`.
- **Optional text** with `value` controlled by RHF — use `value={field.value ?? ''}` to avoid the controlled/uncontrolled warning.
- **Auto-complete** — add `autoComplete="..."` on `<Input>`; browsers respect it and screen readers benefit.

## Disabled submit while submitting

`disabled={form.formState.isSubmitting}` on the submit button. Show "Saving…" label. Don't rely on this for double-submit protection — re-checking is the mutation's job.

## Testing schemas

Unit-test the Zod schema directly with Vitest. Don't render the form (that's E2E territory). Test trim, min, max, default behavior, and error messages.
