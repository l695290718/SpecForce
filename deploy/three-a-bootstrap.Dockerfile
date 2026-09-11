FROM node:22-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/mcp-server/package.json apps/mcp-server/package.json
COPY apps/knowledge-projector/package.json apps/knowledge-projector/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/identity/package.json packages/identity/package.json
COPY packages/knowledge-query/package.json packages/knowledge-query/package.json
COPY packages/scan-contract/package.json packages/scan-contract/package.json
COPY packages/scoped-read/package.json packages/scoped-read/package.json
COPY prisma ./prisma
COPY apps/mcp-server ./apps/mcp-server
COPY apps/knowledge-projector/src ./apps/knowledge-projector/src
COPY packages/core ./packages/core
COPY packages/identity ./packages/identity
COPY packages/knowledge-query ./packages/knowledge-query
COPY packages/scan-contract ./packages/scan-contract
COPY packages/scoped-read ./packages/scoped-read

RUN pnpm install --frozen-lockfile \
  && pnpm db:generate

ENV CI=true
ENV SPECFORGE_MCP_SEED=1
ENV SPECFORGE_MCP_SEED_SCOPE=com.huawei.celon.desiner

CMD ["node_modules/.bin/tsx", "apps/mcp-server/src/bootstrap-3a.ts"]
