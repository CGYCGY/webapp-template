# Recipe naming follows docs/JUSTFILE-CONVENTIONS.md — one vocabulary across all web/mobile repos.

set shell := ["bash", "-cu"]
set dotenv-filename := ".env.local"

# Show available recipes
default:
    @just --list

# Start Convex dev + Next.js frontend together (tmux split)
[group('dev')]
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    if command -v tmux &>/dev/null && [ -z "${TMUX:-}" ]; then
        mkdir -p ./.convex-tmp
        tmux new-session -d -s dev 'CONVEX_TMPDIR=./.convex-tmp bunx convex dev'
        tmux split-window -h -t dev 'bun run dev'
        tmux attach -t dev
    else
        echo "Run in separate terminals:"
        echo "  just convex-dev"
        echo "  just start"
    fi

# Stop all dev processes (tmux session + standalone)
[group('dev')]
dev-stop:
    #!/usr/bin/env bash
    set -uo pipefail
    tmux kill-session -t dev 2>/dev/null && echo "Killed tmux dev session."
    pkill -f 'convex dev' 2>/dev/null && echo "Killed Convex dev process."
    pkill -f 'next dev' 2>/dev/null && echo "Killed Next.js dev process."
    echo "Dev stopped."

# Start Next.js dev server only
[group('dev')]
start *args:
    bun run dev {{ args }}

# Start Convex dev sync only (watches convex/, pushes to deployment).
# CONVEX_TMPDIR keeps esbuild's tmp on the same filesystem as the project — required on
# WSL where /tmp lives on a different filesystem and triggers duplicate-output errors.
[group('convex')]
convex-dev:
    mkdir -p ./.convex-tmp && CONVEX_TMPDIR=./.convex-tmp bunx convex dev

# Regenerate Convex client types from the convex/ source tree
[group('convex')]
convex-codegen:
    bunx convex codegen

# Push Convex functions to the production deployment
[group('convex')]
convex-deploy:
    bunx convex deploy

# Set a Convex environment variable (usage: just convex-env-set KEY VALUE)
[group('convex')]
convex-env-set key value:
    bunx convex env set -- {{ key }} "{{ value }}"

# List all Convex environment variables
[group('convex')]
convex-env-list:
    bunx convex env list

# Sync WORKOS_* runtime env vars from .env.local → Convex deployment
[group('convex')]
convex-env-sync:
    #!/usr/bin/env bash
    set -euo pipefail
    ENV_FILE=".env.local"
    SYNC_PREFIXES="WORKOS_"
    if [[ ! -f "$ENV_FILE" ]]; then echo "ERROR: $ENV_FILE not found"; exit 1; fi
    echo "Fetching current Convex env…"
    declare -A CURRENT=()
    while IFS='=' read -r key value; do
        [[ -z "$key" ]] && continue
        CURRENT["$key"]="$value"
    done < <(bunx convex env list 2>/dev/null || true)
    synced=0
    skipped=0
    while IFS='=' read -r key value; do
        [[ -z "$key" || "$key" =~ ^# ]] && continue
        match=false
        for prefix in $SYNC_PREFIXES; do
            [[ "$key" == ${prefix}* ]] && match=true && break
        done
        $match || continue
        [[ -z "$value" ]] && continue
        if [[ "${CURRENT[$key]+x}" == "x" && "${CURRENT[$key]}" == "$value" ]]; then
            skipped=$((skipped + 1))
            continue
        fi
        echo "  → $key"
        bunx convex env set -- "$key" "$value"
        synced=$((synced + 1))
    done < <(grep -E '^[A-Z_]+=' "$ENV_FILE")
    echo "Synced $synced, skipped $skipped unchanged."

# Build production bundle (local)
[group('build')]
build:
    bun run build

# Serve the production build locally (after `just build`)
[group('build')]
serve:
    bun run start

# Build image, push to GHCR, and trigger Coolify redeploy (usage: just deploy [tag])
[group('deploy')]
deploy tag="latest":
    bash deploy/deploy.sh {{ tag }}

# Type-check the whole project
[group('quality')]
typecheck:
    bun run typecheck

# Lint with Biome
[group('quality')]
lint:
    bun run lint

# Format with Biome (writes changes)
[group('quality')]
fmt:
    bun run format

# Lint + format + organize imports (Biome check --write)
[group('quality')]
check:
    bun run check

# Run Vitest unit tests once (CI mode)
[group('quality')]
test:
    bun run test

# Run Playwright E2E smoke test. Requires Convex dev running and a verified
# WorkOS user in .env.test (see docs/phase-5-smoke-test.md).
[group('quality')]
e2e:
    bun run e2e

# Install all dependencies
[group('deps')]
install:
    bun install

# Update all dependencies
[group('deps')]
update:
    bun update

# Mirror mode: if this product later gains a mobile sibling (e.g. ../mobile-template)
# that shares the same Convex backend, mobile owns convex/ and this repo mirrors it.
# Adjust the path and uncomment to enable.
#
# mobile := "../mobile-template"
#
# # Pull convex/ from mobile (one-way; mobile is the source of truth)
# [group('mirror')]
# convex-mirror:
#     rsync -a --delete {{ mobile }}/convex/ ./convex/
#
# # Run convex dev from the mobile repo (backend lives there)
# [group('mirror')]
# convex-dev-mobile:
#     cd {{ mobile }} && bunx convex dev
