import {
  getSignInUrl,
  getSignUpUrl,
  signOut,
  withAuth,
} from '@workos-inc/authkit-nextjs';
import { Rocket } from 'lucide-react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';

export default async function Home() {
  const { user } = await withAuth();
  const signInUrl = await getSignInUrl();
  const signUpUrl = await getSignUpUrl();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-24">
      <h1 className="text-4xl font-bold">webapp-template</h1>
      <Button>
        <Rocket />
        Get started
      </Button>
      {user ? (
        <form
          action={async () => {
            'use server';
            await signOut();
          }}
        >
          <p className="mb-2 text-sm text-muted-foreground">
            Signed in as {user.email}
          </p>
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      ) : (
        <div className="flex gap-2">
          <Link href={signInUrl} className="underline">
            Sign in
          </Link>
          <Link href={signUpUrl} className="underline">
            Sign up
          </Link>
        </div>
      )}
      <ThemeToggle />
    </main>
  );
}
