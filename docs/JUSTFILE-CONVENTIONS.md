# Justfile Conventions

One recipe vocabulary across every web and mobile repo. Learn it once; it transfers.

## Rules

1. **Noun-first namespacing.** A recipe is `<namespace>-<verb>[-<qualifier>]` where the
   namespace is the tool or area (`convex`, `eas`): `convex-dev`, never `dev-convex`.
2. **Same tail everywhere.** A single-app repo uses the bare canonical name (`dev`,
   `test`, `apk`). A monorepo uses `<area>-` + the exact same name (`web-dev`,
   `mobile-test`, `mobile-apk`) with areas `web` / `mobile`; shared backend recipes
   (`convex-*`) are identical in both. So `just e2e` (single repo) ≡ `just mobile-e2e`
   (monorepo).
3. **Fixed variant suffixes.** `-bg` (backgrounded), `-prod` (production variant),
   `-stop`. Don't invent new ones. Families with several variants (the `apk*` family,
   `eas-env-push`) take a positional variant parameter instead of suffixes.
4. **Function-based groups in every repo:** `dev`, `build`, `deploy`, `convex`,
   `quality`, `deps`. In monorepos the name prefix carries the area, so `just --list`
   has the same shape everywhere.

Key distinctions the vocabulary encodes:

- `dev` — the one command that starts everything (backend + app, tmux split)
- `start` — the app dev server only; `convex-dev` — the backend only
- `serve` — run the production build locally (web)
- `eas-*` — cloud builds/submissions; `apk*` — local sideload builds (mobile)

## Canonical recipes

| Group | Every repo | Web only | Mobile only |
|---|---|---|---|
| deps | `install` `update` | | |
| dev | `dev` `dev-stop` `start` | | `ios` `android` `prebuild` |
| build | | `build` `serve` | `apk` `apk-install` `apk-ship` `apk-share` |
| deploy | | `deploy` | `eas-build-ios` `eas-build-android` `eas-submit-ios` `eas-submit-android` `eas-update` `eas-env-push` |
| convex | `convex-dev` `convex-codegen` `convex-deploy` `convex-env-set` `convex-env-list` `convex-env-sync` | | |
| quality | `check` `lint` `fmt` `typecheck` `test` `e2e` | | |

Project-specific extras are fine — they must follow rule 1 and land in the right group.
Internal helpers are `_`-prefixed and ungrouped.
