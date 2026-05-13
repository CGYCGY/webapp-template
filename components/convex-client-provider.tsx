'use client';

import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { type ReactNode, useState } from 'react';
import { env } from '@/env';

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const [convex] = useState(
    () => new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL),
  );

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
