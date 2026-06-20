'use client';

import { Component, type ReactNode } from 'react';
import { errorMessage } from '@/convex/lib/errorMessage';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class BridgeErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override render() {
    if (this.state.error) {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-24">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="max-w-md rounded border border-red-400 bg-red-50 p-4 text-sm dark:bg-red-950">
            <p className="font-semibold text-red-800 dark:text-red-200">
              WorkOS→Convex bridge is broken
            </p>
            <p className="mt-1 text-red-700 dark:text-red-300">
              Convex sees no identity for your session. Check that{' '}
              <code>convex/auth.config.ts</code> is deployed and that{' '}
              <code>WORKOS_CLIENT_ID</code> set via{' '}
              <code>npx convex env set</code> matches{' '}
              <code>NEXT_PUBLIC_WORKOS_CLIENT_ID</code> in{' '}
              <code>.env.local</code>.
            </p>
            <p className="mt-2 font-mono text-xs text-red-600 dark:text-red-400">
              {errorMessage(this.state.error)}
            </p>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
