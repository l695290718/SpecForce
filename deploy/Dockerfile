FROM node:22-bookworm-slim AS builder

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/mcp-server/package.json apps/mcp-server/package.json
COPY apps/impact-worker/package.json apps/impact-worker/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/graph-store/package.json packages/graph-store/package.json
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile

COPY apps ./apps
COPY packages ./packages

RUN pnpm db:generate && pnpm --filter @specforge/web build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder /workspace/apps/web/.next/standalone ./
COPY --from=builder /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/prisma ./prisma
COPY deploy/web-entrypoint.sh /usr/local/bin/specforge-web

RUN chmod +x /usr/local/bin/specforge-web

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/specforge-web"]
