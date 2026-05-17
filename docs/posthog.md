# PostHog — Product Analytics

`posthog-js` ships event analytics, feature flags, and (optionally) session replay. Initialized once via `<PostHogProvider>` inside `app/layout.tsx`, then consumed throughout the tree via `usePostHog()`. Server-side events go through `posthog-node` via `getPostHogServer()`.

## 1. Create the project

PostHog → **+ New Project**. Platform: **Web**. Region: pick the region nearest your users (EU or US) for the lowest latency and to match data residency requirements. Pair this with the mobile project's region — see §8 for the pairing note.

After creation, PostHog shows two values:

- **Project API key** — `phc_...`. Public; embedded in the client bundle.
- **Host** — `https://us.i.posthog.com` (US), `https://eu.i.posthog.com` (EU), or your self-hosted URL.

## 2. Wire env vars

```
NEXT_PUBLIC_POSTHOG_KEY=phc_XXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

`NEXT_PUBLIC_` prefix is required so Next.js exposes them to the browser. Both `lib/posthog/client.tsx` (browser) and `lib/posthog/server.ts` (Node) read the same key — there is no separate `POSTHOG_API_KEY`, because PostHog's project API key is safe to ship to the client.

`NEXT_PUBLIC_POSTHOG_HOST` is optional and defaults to `https://us.i.posthog.com` if unset.

## 3. Provider at the root

`app/layout.tsx` already wraps the tree with `<PostHogProvider>`:

```tsx
import { PostHogProvider } from '@/lib/posthog';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <PostHogProvider>
          <ConvexClientProvider>
            <ThemeProvider>{children}</ThemeProvider>
          </ConvexClientProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
```

`<PostHogProvider>` is a `"use client"` component. It initializes `posthog-js` inside a `useEffect`, so init runs only in the browser (never during SSR). The provider mounts `<PostHogPageView />` internally, which captures `$pageview` on every App Router navigation by watching `usePathname()` + `useSearchParams()`. The init call also sets `capture_pageview: 'history_change'` as a defence-in-depth fallback for `history.pushState`-driven changes that bypass the App Router.

Init config:

- `person_profiles: 'identified_only'` — anonymous visitors do not get a stored profile until `identify()` is called. Cheaper, and avoids polluting PostHog with bot traffic.
- `autocapture: true` — clicks, form submits, and pageleaves captured automatically.

## 4. Usage

```tsx
'use client';
import { usePostHog } from '@/lib/posthog';

function SaveButton() {
  const posthog = usePostHog();
  return (
    <button
      onClick={() => posthog.capture('profile_saved', { source: 'settings' })}
    >
      Save
    </button>
  );
}
```

Event naming convention: `noun_verb` snake_case (`profile_saved`, `message_sent`, `subscription_started`). Properties go in the second arg.

## 5. Identify users on sign-in

PostHog tracks anonymous users by default. The WorkOS sign-in flow ends at `app/auth/callback/route.ts` (which delegates to `handleAuth()` from `@workos-inc/authkit-nextjs`). The route is a server handler, so the call to `identifyUserOnSignIn` happens **client-side** — wire it into a client component that observes `useAuth()` from `@workos-inc/authkit-nextjs/components` and fires the first time `user` transitions from `null` to a value:

```tsx
'use client';
import { useAuth } from '@workos-inc/authkit-nextjs/components';
import { useEffect, useRef } from 'react';
import { identifyUserOnSignIn } from '@/lib/posthog';

export function PostHogIdentify() {
  const { user } = useAuth();
  const identified = useRef(false);

  useEffect(() => {
    if (!user || identified.current) return;
    identifyUserOnSignIn({
      id: user.id,
      email: user.email,
      name: [user.firstName, user.lastName].filter(Boolean).join(' '),
    });
    identified.current = true;
  }, [user]);

  return null;
}
```

This stitches the anonymous pre-signup session to the identified user — the funnel from anonymous to signed-up stays intact.

On sign-out, call `resetPostHogOnSignOut()` (re-exported from `@/lib/posthog`) so the next anonymous session does not inherit the previous user's distinct ID.

## 6. Server-side capture

Server actions, route handlers, and Convex HTTP actions can capture events via `posthog-node`:

```ts
import { after } from 'next/server';
import { getPostHogServer } from '@/lib/posthog';

export async function POST(req: Request) {
  const posthog = getPostHogServer();
  posthog.capture({
    distinctId: userId,
    event: 'subscription_started',
    properties: { plan: 'pro' },
  });
  after(() => posthog.shutdown());
  return Response.json({ ok: true });
}
```

`getPostHogServer()` returns a cached singleton with `flushAt: 1` and `flushInterval: 0`, so events fire immediately rather than batching. **You must still call `shutdown()`** before the request returns — Next's `after()` (Next 15.1+) is the cleanest way to do it without delaying the response. Skipping `shutdown()` in a short-lived serverless function will drop pending events.

`distinctId` should match the value you pass to `identifyUserOnSignIn` on the client (WorkOS `user.id`), otherwise the server and client events will land in two different profiles.

## 7. Privacy and capture surface

- **Autocapture** (clicks, form submits): on by default. Exclude a single element by adding `class="ph-no-capture"`, or disable globally by passing `autocapture: false` in `posthog.init`.
- **Session replay**: opt-in. Set `disable_session_recording: false` and start it with `posthog.startSessionRecording()` after you have a deliberate review of what the rendered DOM exposes. Mask any input that handles passwords, payment data, or PII with the `ph-no-capture` class or PostHog's `data-ph-no-capture` attribute.
- **Captured properties**: PostHog auto-captures browser, OS, locale, screen size, referrer, UTM tags. None of that is PII, but `posthog.capture('event', { ... })` payloads are at your discretion — avoid putting raw emails, names, or addresses in custom event properties; reference WorkOS user IDs instead.
- **Opt-out**: expose a setting that calls `posthog.opt_out_capturing()` and persist the choice in your user preferences. Re-enable with `posthog.opt_in_capturing()`.

## 8. Pairing with mobile

The mobile app (`mobile-template`) sends events to PostHog via `posthog-react-native`. Use **the same PostHog project** for both web and mobile so funnels (`mobile_app_opened` → `web_subscription_started`) and user profiles unify across surfaces. The `distinctId` in both clients should be the WorkOS `user.id` — that is the join key.

If you ever need to split web vs. mobile (e.g., separate billing, separate feature flags), do it via PostHog's *teams* or by tagging events with a `$source` property — not by spinning up two projects.

## 9. Verifying

Trigger an event during dev:

```ts
posthog.capture('debug_check');
```

PostHog → **Activity → Live events**. The event appears within a few seconds. If it doesn't:

- Confirm `NEXT_PUBLIC_POSTHOG_KEY` is loaded in the bundle (`console.log(process.env.NEXT_PUBLIC_POSTHOG_KEY)` in a client component).
- Check the host matches the project's region.
- For server events: confirm `await posthog.shutdown()` (or `after(() => posthog.shutdown())`) actually runs — drop a `console.log` after it.
- The first few events in a fresh project can take up to a minute to surface — refresh.

## References

- PostHog JavaScript: <https://posthog.com/docs/libraries/js>
- PostHog Next.js guide: <https://posthog.com/docs/libraries/next-js>
- PostHog Node.js: <https://posthog.com/docs/libraries/node>
- Feature flags: <https://posthog.com/docs/feature-flags>
- Session replay: <https://posthog.com/docs/session-replay>
