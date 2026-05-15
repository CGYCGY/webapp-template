'use client';

import { LayoutDashboard, LogOut, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOutAction } from '@/app/dashboard/actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSidebarOpen } from '@/stores/sidebar';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
] as const;

export function DashboardSidebar() {
  const open = useSidebarOpen();
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col gap-2 border-r bg-background p-2 transition-[width] duration-150',
        open ? 'w-56' : 'w-14',
      )}
    >
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              className={cn(
                'flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-accent',
                active && 'bg-accent font-medium',
                !open && 'justify-center',
              )}
            >
              <Icon className="size-4 shrink-0" />
              {open && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>
      <form action={signOutAction}>
        <Button
          type="submit"
          variant="ghost"
          size={open ? 'default' : 'icon'}
          aria-label="Sign out"
          className={cn('w-full', open && 'justify-start')}
        >
          <LogOut className="size-4 shrink-0" />
          {open && <span>Sign out</span>}
        </Button>
      </form>
    </aside>
  );
}
