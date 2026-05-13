import { Rocket } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-24">
      <h1 className="text-4xl font-bold">webapp-template</h1>
      <Button>
        <Rocket />
        Get started
      </Button>
      <ThemeToggle />
    </main>
  );
}
