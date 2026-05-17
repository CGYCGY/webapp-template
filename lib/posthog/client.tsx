'use client';

import posthog from 'posthog-js';
import {
  PostHogProvider as PostHogProviderBase,
  usePostHog,
} from 'posthog-js/react';
import { type ReactNode, useEffect } from 'react';
import { PostHogPageView } from '@/app/PostHogPageView';

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;

    posthog.init(key, {
      api_host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      capture_pageview: 'history_change',
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
