'use client';

import posthog from 'posthog-js';

export type IdentifyUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

/**
 * Stitch the anonymous pre-signup session to the identified user. Call this
 * once the WorkOS user becomes available after sign-in — the natural call site
 * is in a client component that observes `useAuth()` from
 * `@workos-inc/authkit-nextjs/components`, fired the first time `user` flips
 * from null to a value. The post-callback redirect target
 * (`app/auth/callback/route.ts` hands the user to `handleAuth()` which lands
 * them in the app shell) is where the hook should run.
 *
 * On sign-out, call `posthog.reset()` so the next anonymous session does not
 * inherit this user's distinct ID.
 */
export function identifyUserOnSignIn(user: IdentifyUser): void {
  posthog.identify(user.id, {
    email: user.email ?? undefined,
    name: user.name ?? undefined,
  });
}

export function resetPostHogOnSignOut(): void {
  posthog.reset();
}
