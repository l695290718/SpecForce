FROM node:22-bookworm-slim AS builder

WORKDIR /workspace

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/requirement-assessment-worker/package.json apps/requirement-assessment-worker/package.json
COPY packages/core/package.json packages/core/package.json
COPY prisma ./prisma
COPY apps/requirement-assessment-worker ./apps/requirement-assessment-worker
COPY packages/core ./packages/core

RUN pnpm install --frozen-lockfile \
  && pnpm db:generate \
  && pnpm exec tsc -p apps/requirement-assessment-worker/tsconfig.json

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV SPECFORGE_ASSESSMENT_WORKER_HOST=0.0.0.0
ENV SPECFORGE_ASSESSMENT_WORKER_PORT=8093

COPY --from=builder /workspace/apps/requirement-assessment-worker ./apps/requirement-assessment-worker
COPY --from=builder /workspace/packages ./packages
COPY --from=builder /workspace/prisma ./prisma
COPY --from=builder /workspace/node_modules ./node_modules

EXPOSE 8093
CMD ["node_modules/.bin/tsx", "apps/requirement-assessment-worker/src/main.ts"]
