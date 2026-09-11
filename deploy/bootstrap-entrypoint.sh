#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"

node /app/node_modules/prisma/build/index.js db push --schema=/app/prisma/schema.prisma --skip-generate
node /app/deploy/bootstrap-schema-compatibility.mjs
exec /app/node_modules/.bin/tsx /app/apps/knowledge-projector/src/bootstrap-initializer.ts
