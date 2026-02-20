# ---- base ----
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate
WORKDIR /app

# ---- builder ----
FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm nx build web

# ---- runner ----
FROM node:22-alpine AS runner
WORKDIR /app

COPY --from=builder --chown=node:node /app/dist/apps/web/.next/standalone/ ./
COPY --from=builder --chown=node:node /app/dist/apps/web/.next/static ./dist/apps/web/.next/static
COPY --from=builder --chown=node:node /app/dist/apps/web/public ./dist/apps/web/public

USER node
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "dist/apps/web/server.js"]
