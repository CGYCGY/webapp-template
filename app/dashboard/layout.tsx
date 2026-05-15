import { withAuth } from '@workos-inc/authkit-nextjs';
import { redirect } from 'next/navigation';
import { DashboardSidebar } from '@/components/dashboard-sidebar';
import { api } from '@/convex/_generated/api';
import { fetchAuthedQuery } from '@/lib/convex-server';
import { DashboardHeader } from './dashboard-header';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await withAuth();
  if (!user) redirect('/');

  const me = await fetchAuthedQuery(api.users.getMe, {});
  if (!me?.displayName) redirect('/onboarding');

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader />
      <div className="flex flex-1">
        <DashboardSidebar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
