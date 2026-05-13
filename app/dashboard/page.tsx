import { withAuth } from '@workos-inc/authkit-nextjs';
import { redirect } from 'next/navigation';
import { BridgeErrorBoundary } from './bridge-error-boundary';
import { DashboardClient } from './dashboard-client';

export default async function DashboardPage() {
  const { user } = await withAuth();
  if (!user) redirect('/');
  return (
    <BridgeErrorBoundary>
      <DashboardClient />
    </BridgeErrorBoundary>
  );
}
