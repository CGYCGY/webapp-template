'use client';

import posthog from 'posthog-js';
import {
  PostHogProvider as PostHogProviderBase,
  usePostHog,
} from 'posthog-js/react';
import { type ReactNode, useEffect } from 'react';
import { PostHogPageView } from '@/app/PostHogPageView';
import { env } from '@/env';

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const key = env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;

    posthog.init(key, {
      api_host: env.NEXT_PUBLIC_POSTHOG_HOST,
      // Manual capture in <PostHogPageView>; auto-capture would double-count.
      capture_pageview: false,
      person_profiles: 'identified_only',
      autocapture: true,
    });
  }, []);

  return (
    <PostHogProviderBase client={posthog}>
      <PostHogPageView />
      {children}
    </PostHogProviderBase>
  );
}

export { usePostHog };
