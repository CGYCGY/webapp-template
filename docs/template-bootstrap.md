# Template bootstrap

One-time checklist for projects forked from `webapp-template`. **Delete this file after every box is ticked** — the `dev-guidelines` skill then describes your project, not the template.

## Rename

- [ ] `package.json:2` — `"name": "webapp-template"` → project slug.
- [ ] `app/layout.tsx:18-19` — `<title>` and `<meta description>`.
- [ ] `app/page.tsx:13` — `<h1>webapp-template</h1>` landing heading.
- [ ] `stores/sidebar.ts:20` — `'webapp-template:sidebar'` storage-key prefix. Use `'<project-slug>:sidebar'`. Apply the same prefix to every future `persist` store.
- [ ] `justfile:1` — header comment.

## Fill in

- [ ] `.env.local`, `.env.test`, `.env.production` — project-specific values.
- [ ] `deploy/.env.deploy` — `COOLIFY_WEBHOOK_URL`, `COOLIFY_API_TOKEN`. `GITHUB_ORG` and `REPO_NAME` can be left to derive from the git remote.

## Adjust if your stack diverges

- [ ] `justfile:81` `SYNC_PREFIXES` — extend if the project adds secret prefixes beyond `WORKOS_`.
- [ ] `deploy/Dockerfile:17` — add `ARG` / `ENV` lines for any new `NEXT_PUBLIC_*` env you introduce so build-time inlining picks them up.

## Verify

- [ ] `just check && just typecheck && just test` pass.
- [ ] `rg 'webapp-template' -g '!docs/template-bootstrap.md'` returns nothing.
- [ ] Delete this file.
