'use client';

import { useQuery } from 'convex/react';
import type { FunctionReference } from 'convex/server';
import { api } from '@/convex/_generated/api';
import { formatRelativeFromNow } from '@/lib/date';

type WhoamiApi = {
  whoami: FunctionReference<
    'query',
    'public',
    Record<string, never>,
    { subject: string; tokenIdentifier: string }
  >;
};

type MeRow = {
  _id: string;
  _creationTime: number;
  authId: string;
  email: string;
  name: string;
  displayName?: string;
  bio?: string;
  updatedAt?: number;
};

type UsersApi = {
  getMe: FunctionReference<
    'query',
    'public',
    Record<string, never>,
    MeRow | null
  >;
};

export function DashboardClient() {
  const whoamiApi = api.users as unknown as WhoamiApi;
  const usersApi = api.users as unknown as UsersApi;

  // whoami throws when the JWT bridge is broken — BridgeErrorBoundary catches it.
  const whoami = useQuery(whoamiApi.whoami);
  const me = useQuery(usersApi.getMe);

  if (whoami === undefined || me === undefined) {
    return <p className="p-8 text-muted-foreground">Checking bridge…</p>;
  }

  // Bridge is working (whoami returned) but webhook hasn't synced the user row yet.
  if (me === null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-24">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="max-w-md rounded border border-yellow-400 bg-yellow-50 p-4 text-sm dark:bg-yellow-950">
          <p className="font-semibold text-yellow-800 dark:text-yellow-200">
            Bridge OK — user row not yet synced
          </p>
          <p className="mt-1 text-yellow-700 dark:text-yellow-300">
            Convex sees your identity (<code>{whoami.subject}</code>) but has no
            matching row in the <code>users</code> table. Check that the WorkOS
            webhook is hitting{' '}
            <code>https://[deployment].convex.site/workos/webhook</code> with
            the secret matching <code>WORKOS_WEBHOOK_SECRET</code>.
          </p>
        </div>
      </main>
    );
  }

  const displayName = me.displayName ?? me.name;
  const lastUpdated = me.updatedAt ?? me._creationTime;

  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p>
        <span className="font-medium">Name:</span> {displayName}
      </p>
      <p>
        <span className="font-medium">Email:</span> {me.email}
      </p>
      <p className="text-sm text-muted-foreground">
        Last updated {formatRelativeFromNow(lastUpdated)}
      </p>
    </section>
  );
}
