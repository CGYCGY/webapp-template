# ============================================================================
# webapp-template justfile
# ============================================================================
# Next.js 16 + Bun + Convex + WorkOS. Run `just --list` to see all recipes.
# ============================================================================

set shell := ["bash", "-cu"]
set dotenv-filename := ".env.local"

# Show available recipes
default:
    @just --list

# ============================================================================
# LOCAL DEVELOPMENT
# ============================================================================

# Start Convex dev + Next.js frontend together (tmux split)
[group('dev')]
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    if command -v tmux &>/dev/null && [ -z "${TMUX:-}" ]; then
        tmux new-session -d -s dev 'bunx convex dev'
        tmux split-window -h -t dev 'bun run dev'
        tmux attach -t dev
    else
        echo "Run in separate terminals:"
        echo "  just dev-convex"
        echo "  just dev-frontend"
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

# Start Convex dev sync only (watches convex/, pushes to deployment)
[group('dev')]
dev-convex:
    bunx convex dev

# Start Next.js dev server only
[group('dev')]
dev-frontend *args:
    bun run dev {{ args }}

# ============================================================================
# CONVEX UTILITIES
# ============================================================================

# Push Convex functions to the production deployment
[group('convex')]
convex-deploy:
    bunx convex deploy

# Set a Convex environment variable (usage: just env-set KEY VALUE)
[group('convex')]
env-set key value:
    bunx convex env set -- {{ key }} "{{ value }}"

# List all Convex environment variables
[group('convex')]
env-list:
    bunx convex env list

# Sync WORKOS_* runtime env vars from .env.local → Convex deployment
[group('convex')]
env-sync:
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

# ============================================================================
# BUILD & DEPLOY
# ============================================================================

# Build production bundle (local)
[group('build')]
build:
    bun run build

# Start production server (after `just build`)
[group('build')]
start:
    bun run start

# Build image, push to GHCR, and trigger Coolify redeploy (usage: just deploy [tag])
[group('build')]
deploy tag="latest":
    bash deploy/deploy.sh {{ tag }}

# ============================================================================
# CODE QUALITY
# ============================================================================

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

# ============================================================================
# DEPENDENCIES
# ============================================================================

# Install all dependencies
[group('deps')]
install:
    bun install

# Update all dependencies
[group('deps')]
update:
    bun update
