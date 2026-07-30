ARG NODE_IMAGE=node:22.23.1-bookworm@sha256:a25c9934ff6382cd4f08b6bc26c82bf4ea69b1e6f8dabfb2ead457374127c365

FROM ${NODE_IMAGE} AS builder
WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile --filter specforge-design-center

COPY apps/graph-projector ./apps/graph-projector

RUN pnpm db:generate \
  && pnpm exec tsc -p apps/graph-projector/tsconfig.json

FROM ${NODE_IMAGE} AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV SPECFORGE_GRAPH_PROJECTOR_HOST=0.0.0.0
ENV SPECFORGE_GRAPH_PROJECTOR_PORT=8090

COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/apps/graph-projector/dist ./apps/graph-projector/dist
COPY --from=builder /workspace/prisma ./prisma

USER node

EXPOSE 8090

CMD ["node", "apps/graph-projector/dist/main.js"]
