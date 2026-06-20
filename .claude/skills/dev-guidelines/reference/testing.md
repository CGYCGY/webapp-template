# Testing

Two suites with different scope:

| Suite | Tool | Location | Env | Scope |
|---|---|---|---|---|
| Unit | Vitest + jsdom + Testing Library | `__tests__/**/*.{test,spec}.{ts,tsx}` | jsdom | Pure modules (schemas, helpers). No Convex `_generated` imports — `tsconfig.json` excludes `convex/`. |
| E2E | Playwright | `e2e/**/*.spec.ts` | Real browser, real Convex, real WorkOS | User journeys through the running app. |

## Vitest setup

`vitest.config.mts`:

```ts
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['__tests__/**/*.{test,spec}.{ts,tsx}'],
  },
});
```

- `tsconfigPaths()` makes `@/*` work inside tests.
- `jsdom` env supports component tests via Testing Library.
- `vitest.setup.ts` is where `@testing-library/jest-dom` matchers register.

## Unit test scope

- **Schemas** — test trim, min, max, defaults, error messages directly against the Zod schema.
- **Pure helpers** — anything in `lib/` that doesn't import Convex.
- **Components** — Testing Library `render` + `screen.getBy*` queries. Mock Convex hooks at the module boundary if you must.

Do **not** import from `@/convex/_generated/*` — `tsconfig.json` excludes `convex/` from the Next type project, so the generated types aren't available in this scope. Test the Convex handlers' behavior through E2E or through extracted pure helpers (the Zod schema in `convex/schemas/`).

## Test placement

- Unit tests under `__tests__/<feature>.test.ts` mirroring the source name.
- Don't colocate `.test.ts` next to source in this codebase — Vitest's `include` glob only watches `__tests__/`.

## Playwright config

`playwright.config.ts`:

```ts
fullyParallel: false,
workers: 1,
retries: process.env.CI ? 1 : 0,
trace: 'retain-on-failure',
webServer: { command: 'bun run dev', reuseExistingServer: !process.env.CI },
```

Why these settings:

- **`workers: 1`, `fullyParallel: false`** — WorkOS hosted auth rate-limits concurrent sign-ins. Don't bump.
- **`retain-on-failure` trace** — failed runs leave `test-results/**/trace.zip`. Open with `bunx playwright show-trace`.
- **`webServer.reuseExistingServer: !process.env.CI`** — locally, the test uses the already-running `just dev` server. CI starts its own.

## E2E credentials

`.env.test` holds `E2E_USER_EMAIL` and `E2E_USER_PASSWORD` for a verified WorkOS user. `.env.test.example` is checked in; copy it to `.env.test` and populate before running. The smoke spec guards with `test.skip(!envEmail || !envPassword, ...)` so a missing `.env.test` doesn't fail CI hard — but you should run with real creds before merge.

## WorkOS hosted-auth selectors

WorkOS's hosted-auth markup shifts between minor releases. Target stable selectors — `input[type="email"]` and `input[type="password"]` — rather than visible labels. When the test breaks after a WorkOS update, check those selectors first; only inspect role-based queries (`getByRole('button', { name: /continue|next|sign in/i })`) when the input pattern is fine.

## Pre-push hook

Lefthook runs `bun run test` AND `bun run typecheck` in parallel on `git push` (`lefthook.yml`). Both Vitest and `tsc --noEmit` must pass before you can push. E2E runs are not in the hook — they require Convex dev + real credentials, both unreliable in pre-push.

## When you add a feature

1. **Unit-test the Zod schema** in `__tests__/<feature>-schema.test.ts` — valid input, invalid input, boundaries.
2. **Unit-test pure helpers** if you add any to `lib/`.
3. **Add or extend an E2E flow** for the user journey if the feature changes auth state, navigation, or persistence.

## Don't

- Don't mock Convex with a hand-rolled fake. The schema is the contract — test it directly.
- Don't write E2E tests that hit a third-party API beyond what's already exercised (WorkOS sign-in). Stub at the Convex action layer.
- Don't run E2E in `--workers > 1` to "speed it up." WorkOS rate-limits will flake the run.
