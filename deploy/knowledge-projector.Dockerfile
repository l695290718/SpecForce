FROM node:22-bookworm-slim AS builder

WORKDIR /workspace

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/knowledge-projector/package.json apps/knowledge-projector/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/knowledge-query/package.json packages/knowledge-query/package.json
COPY prisma ./prisma
COPY apps/knowledge-projector ./apps/knowledge-projector
COPY packages/core ./packages/core
COPY packages/knowledge-query ./packages/knowledge-query

RUN pnpm install --frozen-lockfile
RUN pnpm db:generate && pnpm --filter @specforge/knowledge-projector build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV SPECFORGE_KNOWLEDGE_PROJECTOR_HOST=0.0.0.0
ENV SPECFORGE_KNOWLEDGE_PROJECTOR_PORT=8091

COPY --from=builder /workspace/apps/knowledge-projector/dist ./dist
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/packages ./packages
COPY --from=builder /workspace/prisma ./prisma

RUN rm -rf node_modules/@specforge \
  && mkdir -p node_modules/@specforge \
  && ln -s /app/packages/core node_modules/@specforge/core \
  && ln -s /app/packages/knowledge-query node_modules/@specforge/knowledge-query

EXPOSE 8091

CMD ["node_modules/.bin/tsx", "dist/main.js"]
