import { withAuth } from '@workos-inc/authkit-nextjs';
import { redirect } from 'next/navigation';
import { DashboardClient } from './dashboard-client';

export default async function DashboardPage() {
  const { user } = await withAuth();
  if (!user) redirect('/');
  return <DashboardClient />;
}
