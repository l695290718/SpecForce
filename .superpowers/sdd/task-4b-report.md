# Task 4B Report

## Scope

- Owned files only:
  - `prisma/schema.prisma`
  - `apps/mcp-server/src/persistence.ts`
  - `apps/mcp-server/src/persistence.test.ts`

## RED Evidence

- Direct persistence test before the fix:
  - `rejects invalid context packs before schema setup or prisma writes`
  - failed because `upsertContextPack` reached `prisma.architectureScope.upsert` before throwing `ASSET_TRANSLATION_REQUIRED`
- Direct persistence test before the fix:
  - `stores and reads complete context pack payloads before falling back to legacy columns`
  - failed because `prisma.contextPack.upsert` omitted `payload` in both `create` and `update`

## GREEN Changes

- Added nullable `payload` to Prisma `ContextPack`
- Updated dynamic schema setup to add nullable `ContextPack.payload` for existing databases
- Moved `validateAssetLocalization("contextPack", pack)` ahead of schema setup, scope resolution, and Prisma writes
- Persisted the canonical English context pack plus `localizedContent.zh` in `payload` while keeping normalized columns
- Updated row conversion to prefer `payload` when present and valid, with fallback to legacy normalized columns when absent or invalid
- Added a direct legacy fallback assertion for null-payload rows
- Made persisted search reads fall back to canonical content when a requested locale overlay is unavailable, so legacy context packs remain readable in mixed result sets

## Verification

- Direct persistence tests:
  - `vitest run apps/mcp-server/src/persistence.test.ts`
  - result: 10/10 passing
- MCP typecheck:
  - `pnpm --filter @specforge/mcp-server typecheck`
  - result: passing
- Core typecheck:
  - `pnpm --filter @specforge/core typecheck`
  - result: passing
- Core tests:
  - `pnpm --filter @specforge/core test`
  - result: 46/46 passing
  - note: rerun outside the sandbox after the first attempt hit a filesystem access-denied error while loading Vitest config
- Prisma client generation:
  - `pnpm db:generate`
  - result: passing

## Self-Review

- Scope checks remain unchanged
- Seed data and seed tests were not touched
- Read compatibility is preserved for legacy rows with null `payload`

## Commit

- Planned commit message: `feat: persist bilingual context pack payloads`
