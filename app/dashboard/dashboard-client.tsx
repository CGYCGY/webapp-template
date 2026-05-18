'use client';

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { formatRelativeFromNow } from '@/lib/date';
import { useMe } from './me-context';

export function DashboardClient() {
  const me = useMe();

  // Diagnostic only when the layout's server-side getMe returned null —
  // distinguishes "JWT bridge broken" (whoami throws) from "webhook hasn't
  // synced yet" (whoami returns). Skipped on the happy path so we don't pay
  // for a subscription on every dashboard view.
  const whoami = useQuery(api.users.whoami, me === null ? {} : 'skip');

  if (me === null) {
    if (whoami === undefined) {
      return <p className="p-8 text-muted-foreground">Checking bridge…</p>;
    }
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
