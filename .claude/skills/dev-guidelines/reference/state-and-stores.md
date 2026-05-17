# State & stores

## When to use which state

| Need | Use |
|---|---|
| Server data (anything from Convex) | `useQuery` / `useMutation` — Convex is the source of truth |
| One-component UI flag | `useState` |
| Multi-component UI flag that **doesn't** survive reload | Zustand without `persist` |
| Multi-component UI flag that **must** survive reload | Zustand with `persist` middleware (this section) |
| Auth state | Don't store. Read from WorkOS via `useAuth()` or `withAuth()`. |
| Theme | Don't store. Use `next-themes`. |

Don't reach for Zustand for a single-page boolean. State that's only consumed inside one component subtree belongs in `useState`.

## Zustand store skeleton

```ts
'use client';

import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type SidebarState = {
  open: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
};

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      open: true,
      toggle: () => set((s) => ({ open: !s.open })),
      setOpen: (open) => set({ open }),
    }),
    { name: 'webapp-template:sidebar' },
  ),
);
```

Notes:

- `'use client'` at top — Zustand stores are client-only.
- One store file per concern. Don't merge unrelated slices.
- Actions live inside the store factory (`toggle`, `setOpen`). Components shouldn't compute new state from outside.
- `persist` middleware writes to `localStorage` under the configured `name`.

## Storage key prefix

Every persisted store uses `<project-slug>:<store-name>` as the `name` (see `stores/sidebar.ts` for a live example). Without a project-specific prefix, apps served from `localhost` or a shared subdomain collide in localStorage.

## SSR-safe selector pattern

A persisted Zustand slice can mismatch the SSR render (server doesn't know what's in `localStorage`). The fix is a mount-gated selector that returns the in-memory default until the store has rehydrated.

```ts
export function useStoreSlice(): SliceType {
  const value = useStore((s) => s.slice);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted ? value : defaultValue;
}
```

Components that render based on persisted state should consume the mount-gated selector, not the raw store.

Components that only **dispatch** to the store (e.g. a toggle button) can use the raw store directly — there's no read of persisted state, no hydration risk.

## Don't store derived state

Never persist a value that can be computed from other state. Compute on render. The store should hold the smallest set of facts.

## Don't store server data in Zustand

Convex `useQuery` provides reactive server state with cache, subscriptions, and invalidation built in. Don't shadow it in Zustand. If you need to "mirror" a server value for local edits, prefer RHF's form state, then commit via a Convex mutation.

## When you add a new store

1. New file: `stores/<concern>.ts`.
2. `'use client'` at top.
3. Define the slice type, create with `create<...>()(...)`.
4. If persisted, set `name: '<project-slug>:<concern>'`.
5. If reads are render-time, write a mount-gated selector hook in the same file.
6. Don't export the raw store unless callers really need actions — selector hooks are easier to refactor.
