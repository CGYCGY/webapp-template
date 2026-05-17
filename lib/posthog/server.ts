import { PostHog } from 'posthog-node';

let client: PostHog | null = null;

/**
 * Server-side PostHog client for capturing events from server actions, route
 * handlers, and other Node contexts. Lazily constructed and cached as a
 * singleton — callers must `await client.shutdown()` (or use Next's `after()`
 * helper) before short-lived requests return, otherwise batched events may be
 * dropped when the function instance is recycled. See docs/posthog.md.
 */
export function getPostHogServer(): PostHog {
  if (client) return client;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    throw new Error(
      'NEXT_PUBLIC_POSTHOG_KEY is not set — cannot construct server-side PostHog client',
    );
  }

  client = new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    flushAt: 1,
    flushInterval: 0,
  });

  return client;
}
