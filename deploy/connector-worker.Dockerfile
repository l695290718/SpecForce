FROM node:22-bookworm-slim AS builder

WORKDIR /workspace

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/connector-worker/package.json apps/connector-worker/package.json
COPY apps/mcp-server/package.json apps/mcp-server/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/identity/package.json packages/identity/package.json
COPY packages/scan-contract/package.json packages/scan-contract/package.json
COPY packages/scoped-read/package.json packages/scoped-read/package.json
COPY prisma ./prisma
COPY apps/connector-worker ./apps/connector-worker
COPY apps/mcp-server ./apps/mcp-server
COPY packages/core ./packages/core
COPY packages/identity ./packages/identity
COPY packages/scan-contract ./packages/scan-contract
COPY packages/scoped-read ./packages/scoped-read

RUN pnpm install --frozen-lockfile \
  && pnpm db:generate \
  && pnpm exec tsc -p apps/connector-worker/tsconfig.json

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV SPECFORGE_CONNECTOR_WORKER_HOST=0.0.0.0
ENV SPECFORGE_CONNECTOR_WORKER_PORT=8092

COPY --from=builder /workspace/apps/connector-worker ./apps/connector-worker
COPY --from=builder /workspace/apps/mcp-server ./apps/mcp-server
COPY --from=builder /workspace/packages ./packages
COPY --from=builder /workspace/prisma ./prisma
COPY --from=builder /workspace/node_modules ./node_modules

EXPOSE 8092
CMD ["node_modules/.bin/tsx", "apps/connector-worker/src/main.ts"]
