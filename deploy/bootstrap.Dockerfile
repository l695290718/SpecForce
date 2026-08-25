FROM node:22-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/knowledge-projector/package.json apps/knowledge-projector/package.json
COPY apps/mcp-server/package.json apps/mcp-server/package.json
COPY packages ./packages
COPY prisma ./prisma
COPY apps/knowledge-projector/src/bootstrap-initializer.ts apps/knowledge-projector/src/bootstrap-initializer.ts
COPY apps/mcp-server/src/localization-report.ts apps/mcp-server/src/localization-report.ts
COPY apps/mcp-server/src/relationships apps/mcp-server/src/relationships
COPY deploy/bootstrap-schema-compatibility.mjs /app/deploy/bootstrap-schema-compatibility.mjs

RUN corepack enable \
  && pnpm install --frozen-lockfile \
  && pnpm db:generate

COPY deploy/bootstrap-entrypoint.sh /usr/local/bin/specforge-bootstrap
RUN chmod +x /usr/local/bin/specforge-bootstrap

ENTRYPOINT ["/usr/local/bin/specforge-bootstrap"]
