'use client';

import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebarStore } from '@/stores/sidebar';

export function DashboardHeader() {
  const toggle = useSidebarStore((s) => s.toggle);
  return (
    <header className="flex h-12 items-center gap-2 border-b px-3">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Toggle sidebar"
        onClick={toggle}
      >
        <Menu className="size-4" />
      </Button>
      <span className="font-medium">Dashboard</span>
    </header>
  );
}
