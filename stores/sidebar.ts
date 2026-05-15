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

// SSR-safe selector: returns the persisted store's default on the server and
// during the first client render, then swaps to the hydrated value once the
// store has rehydrated from localStorage. Prevents hydration mismatches when
// the persisted slice differs from the in-memory default.
export function useSidebarOpen(): boolean {
  const open = useSidebarStore((s) => s.open);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted ? open : true;
}
