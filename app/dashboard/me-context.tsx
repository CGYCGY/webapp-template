'use client';

import { createContext, type ReactNode, useContext } from 'react';
import type { Doc } from '@/convex/_generated/dataModel';

export type Me = Doc<'users'>;

const MeContext = createContext<Me | null | undefined>(undefined);

export function MeProvider({
  value,
  children,
}: {
  value: Me | null;
  children: ReactNode;
}) {
  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}

export function useMe(): Me | null {
  const value = useContext(MeContext);
  if (value === undefined) {
    throw new Error('useMe must be used inside <MeProvider>');
  }
  return value;
}
