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
- Review follow-up RED:
  - `falls back to legacy context pack columns when persisted payload JSON is invalid or incomplete`
  - failed because `{}` was accepted as a trusted payload shape, so lookup for `ctx-empty-object-pack` returned `Asset not found` instead of falling back to normalized columns
- Review follow-up RED:
  - `preserves strict zh read behavior for non-context-pack assets without localization overlays`
  - failed because localized reads for non-context-pack assets were incorrectly falling back to canonical content instead of preserving Task 2 strict enforcement

## GREEN Changes

- Added nullable `payload` to Prisma `ContextPack`
- Updated dynamic schema setup to add nullable `ContextPack.payload` for existing databases
- Moved `validateAssetLocalization("contextPack", pack)` ahead of schema setup, scope resolution, and Prisma writes
- Persisted the canonical English context pack plus `localizedContent.zh` in `payload` while keeping normalized columns
- Updated row conversion to prefer `payload` only when it parses into a structurally valid complete `ContextPack` and passes localization validation
- Preserved fallback to legacy normalized columns when `payload` is null, malformed JSON, or an invalid/incomplete object such as `{}`
- Added a direct legacy fallback assertion for null-payload rows
- Added direct regression coverage for malformed JSON and invalid-object payload fallback
- Limited canonical localized-read fallback to legacy-reconstructed Context Packs only; non-context-pack assets keep Task 2 strict read behavior

## Verification

- Direct persistence tests:
  - `vitest run apps/mcp-server/src/persistence.test.ts`
  - result: 12/12 passing
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
- Read compatibility is preserved for legacy Context Pack rows with null, malformed, or invalid-object `payload`
- Non-Context-Pack persisted reads still enforce localization strictly for non-`en` locales

## Commit

- Previous implementation commit: `feat: persist bilingual context pack payloads`
- Follow-up fix commit: `fix: validate persisted context pack payloads`
