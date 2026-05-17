# UI & styling

## Stack

- **Tailwind v4** (PostCSS only, no `tailwind.config.js`). Tokens are CSS variables in `app/globals.css`.
- **shadcn `base-nova` style** (`components.json`).
- **Base UI primitives** (`@base-ui/react`) under the hood — *not* pure Radix.
- **CVA** (`class-variance-authority`) for component variants.
- **`cn()`** from `lib/utils.ts` merges classes — always last for caller overrides.
- **Lucide React** for icons, sized `size-4` by default.
- **Motion** (`motion` package) for animations.

## Canonical CVA primitive

```ts
// components/ui/<name>.tsx
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva('base classes …', {
  variants: {
    variant: { default: '...', outline: '...', ghost: '...', destructive: '...' },
    size:    { default: '...', sm: '...', lg: '...', icon: '...' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

function Button({
  className,
  variant,
  size,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
```

Notes encoded in this pattern:

- `data-slot="..."` attribute on every primitive — used by parent CVA selectors (e.g. `in-data-[slot=button-group]:...`).
- `className` is the **last** thing inside `cn(...)` so caller overrides win.
- Variants use Tailwind state selectors (`[a]:hover:bg-...`, `aria-expanded:bg-...`, `dark:bg-...`) — not JS conditionals.
- Icon-only sizes are separate variants; don't hand-roll `<Button>` with manual padding.

When adding a new primitive, follow this same shape: import the Base UI primitive (or Radix when there's no Base UI equivalent), CVA-wrap it, expose variant + size, set `data-slot`.

## `cn()` rule

```ts
// lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- Use `cn(...)` whenever combining static + conditional + caller classes.
- `tailwind-merge` resolves Tailwind conflicts (later wins) — that's why caller `className` goes last.
- Never concatenate class strings with `+`. Use `cn(...)`.

## Base UI vs Radix

This codebase uses Base UI for primitives. The only Radix import is `@radix-ui/react-slot` for `<FormControl>` in `components/ui/form.tsx`, because Base UI doesn't expose an equivalent slot primitive.

When adding a new primitive:

1. Check `@base-ui/react` first.
2. Fall back to `@radix-ui/react-<primitive>` only when Base UI has no equivalent.
3. Match the existing `data-slot` and CVA conventions.

## Icons (Lucide)

```tsx
import { Menu } from 'lucide-react';
<Menu className="size-4" />
```

- Default size is `size-4`.
- Don't add `<svg>` directly; use Lucide.
- Check the installed `lucide-react` major version in `package.json` before importing — icon names occasionally rename.

## Theme

- `<html suppressHydrationWarning>` on the root.
- `<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>`.
- Components that switch on `resolvedTheme` must mount-gate.
- Theme tokens are CSS variables — use `bg-background`, `text-foreground`, etc., not raw `bg-white`.

## Dark mode

- Tailwind v4 uses `.dark` class (set automatically by `next-themes`).
- Pair light/dark variants in CVA: `bg-destructive/10 ... dark:bg-destructive/20`.
- Don't ship a one-mode-only component.

## Layout primitives

- Use Tailwind grid / flex utilities directly; no `<Stack>` / `<Box>` wrappers.
- Containers: `max-w-md`, `max-w-4xl`, etc., centered with `mx-auto` if needed.
- Min-screen layouts: `min-h-screen flex-col` is the canonical full-page shell.

## Don't

- Don't add a `tailwind.config.js` — Tailwind v4 is PostCSS-only (`postcss.config.mjs`).
- Don't import from `@radix-ui/*` unless Base UI doesn't have it (Slot is the documented exception).
- Don't hardcode hex colors. Use theme tokens.
- Don't bypass `cn()` for class composition.
- Don't write `<svg>` by hand when a Lucide icon exists.
