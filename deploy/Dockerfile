# syntax=docker/dockerfile:1.7
# Multi-stage build for Next.js 16 with Bun.
# Produces a minimal runtime image from `output: 'standalone'`.

# ---- deps ----
FROM oven/bun:1.2-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

# ---- builder ----
FROM oven/bun:1.2-alpine AS builder
WORKDIR /app

# NEXT_PUBLIC_* must be present at build time so Next can inline them
# into the client bundle. Server-only vars are read at runtime by Coolify.
ARG NEXT_PUBLIC_CONVEX_URL
ARG NEXT_PUBLIC_WORKOS_CLIENT_ID
ENV NEXT_PUBLIC_CONVEX_URL=$NEXT_PUBLIC_CONVEX_URL
ENV NEXT_PUBLIC_WORKOS_CLIENT_ID=$NEXT_PUBLIC_WORKOS_CLIENT_ID

# Skip @t3-oss/env-nextjs server-var validation during build; the app
# still validates at runtime when the real envs are present.
ENV SKIP_ENV_VALIDATION=1
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN bun run build

# ---- runner ----
FROM oven/bun:1.2-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# wget is used by HEALTHCHECK; it ships in alpine base
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=60s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/healthz >/dev/null 2>&1 || exit 1

CMD ["bun", "server.js"]
