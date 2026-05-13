'use client';

import { useQuery } from 'convex/react';
import type { FunctionReference } from 'convex/server';
import { api } from '@/convex/_generated/api';

type UsersApi = {
  getMe: FunctionReference<
    'query',
    'public',
    Record<string, never>,
    { authId: string; email: string; name: string } | null
  >;
};

export function DashboardClient() {
  const usersApi = api.users as unknown as UsersApi;
  const me = useQuery(usersApi.getMe);

  if (me === undefined) {
    return <p className="p-8">Loading…</p>;
  }

  if (me === null) {
    return (
      <p className="p-8">
        Signed in via WorkOS but no Convex user record yet. Check that the
        WorkOS webhook is configured to point at your Convex deployment.
      </p>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-24">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p>
        <span className="font-medium">Name:</span> {me.name}
      </p>
      <p>
        <span className="font-medium">Email:</span> {me.email}
      </p>
    </main>
  );
}
