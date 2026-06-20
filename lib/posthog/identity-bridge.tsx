'use client';

import { useAuth } from '@workos-inc/authkit-nextjs/components';
import { useMutation } from 'convex/react';
import { useEffect, useRef } from 'react';
import { api } from '@/convex/_generated/api';
import { identifyUserOnSignIn, resetPostHogOnSignOut } from './identify';

// Mirrors WorkOS auth state into PostHog: identify on first sign-in, reset on
// sign-out so the next anonymous session doesn't inherit the distinct ID. Also
// self-provisions the Convex user row once per sign-in so first mutations don't
// fail if the WorkOS webhook hasn't synced yet. Must render inside
// AuthKitProvider (for useAuth()) and ConvexProviderWithAuth (for useMutation).
export function PostHogIdentityBridge() {
  const { user, loading } = useAuth();
  const bootstrapSelf = useMutation(api.users.bootstrapSelf);
  const identifiedFor = useRef<string | null>(null);
  const bootstrappedFor = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (user) {
      if (identifiedFor.current === user.id) return;
      identifiedFor.current = user.id;
      identifyUserOnSignIn({
        id: user.id,
        email: user.email,
        name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
      });
    } else if (identifiedFor.current !== null) {
      identifiedFor.current = null;
      resetPostHogOnSignOut();
    }
  }, [user, loading]);

  useEffect(() => {
    if (loading || !user) return;
    if (bootstrappedFor.current === user.id) return;
    bootstrappedFor.current = user.id;
    // Convex auth is established async; a transient failure (e.g. token not yet
    // attached) shouldn't crash — the next mutation retries provisioning.
    bootstrapSelf().catch(() => {
      bootstrappedFor.current = null;
    });
  }, [user, loading, bootstrapSelf]);

  return null;
}
