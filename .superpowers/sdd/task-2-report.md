# Task 2 Report: MCP Atomic Enforcement and Locale-Aware Reads

## Scope

Implemented only the Task 2 MCP boundary work in:

- `apps/mcp-server/src/persistence.ts`
- `apps/mcp-server/src/tools.ts`
- `apps/mcp-server/src/persistence.test.ts`

Did not modify seed files, web files, `apps/mcp-server/src/resources.ts`, `packages/core/src/summary/render.ts`, or `packages/core/src/governance/service.ts` because Task 2 was satisfied without widening the surface area.

## RED

### Added failing tests

Expanded `apps/mcp-server/src/persistence.test.ts` to cover:

1. Invalid bilingual design-asset payload rejection before schema setup or Prisma writes
2. Stable localization error metadata for rejected proposal writes
3. Acceptance of valid bilingual asset/proposal payloads
4. Chinese semantic search matching with localized result payloads
5. Canonical raw reads with locale-aware rendered markdown

### RED command

Run:

```powershell
.\node_modules\.bin\vitest.CMD run apps/mcp-server/src/persistence.test.ts
```

### RED evidence

First meaningful RED run failed in the expected Task 2 areas:

- invalid writes hit schema setup before localization validation
- search returned canonical English `name`/`summary` even for `locale: "zh"`
- rendered markdown stayed in English even when a Chinese locale was requested

Before that, two environment blockers were cleared:

1. `pnpm install` to ensure workspace dependencies were present
2. `pnpm db:generate` to generate the Prisma client for this worktree

## GREEN

### `apps/mcp-server/src/persistence.ts`

- Enforced `validateAssetLocalization(...)` at the MCP write boundary for:
  - `upsertDesignAsset`
  - `upsertProposal`
- Moved validation ahead of `ensureMcpPersistenceSchema()` so invalid bilingual payloads fail before any Prisma/schema activity
- Normalized persisted write payloads through `localizeAsset(..., "en")` so canonical English is what gets stored, including legacy proposal English overlay normalization
- Added optional `locale: AssetLocale` support to rendered markdown reads
- Added optional `locale: AssetLocale` support to search results
- Kept raw JSON reads canonical English with `localizedContent.zh` intact
- Kept search matching against the full persisted payload so Chinese semantic text continues to match

### `apps/mcp-server/src/tools.ts`

- Extended `search_design_assets` input schema with optional `locale: "zh" | "en"`
- Extended `get_asset_detail` input schema with optional `locale: "zh" | "en"`
- Passed locale through only for rendered markdown reads, not raw JSON reads

### `apps/mcp-server/src/persistence.test.ts`

- Added focused Task 2 regression coverage around write atomicity, stable error metadata, bilingual search behavior, and localized rendered output

## Verification

### Focused MCP test

Run:

```powershell
.\node_modules\.bin\vitest.CMD run apps/mcp-server/src/persistence.test.ts
```

Result:

- PASS: `7` tests

### Core suite

Run:

```powershell
pnpm --filter @specforge/core test
```

Result:

- PASS: `6` files, `39` tests

### MCP typecheck

Run:

```powershell
pnpm --filter @specforge/mcp-server typecheck
```

Result:

- PASS
- Exit code: `0`

### Diff hygiene

Run:

```powershell
git diff --check
```

Result:

- No whitespace errors
- Only CRLF/LF warnings from Git for the edited MCP files

## Self-review

Checked the Task 2 brief against the diff:

- `upsertDesignAsset` validates before schema/db work: yes
- `upsertProposal` validates before schema/db work: yes
- stable localization error fields preserved: yes
- no partial update path for invalid payloads: yes, tests assert no Prisma calls
- raw reads keep canonical English plus `localizedContent.zh`: yes
- rendered reads accept optional locale: yes
- search accepts optional locale: yes
- search still matches Chinese semantic text: yes
- search returns localized `name` and `summary`: yes
- scope authorization/isolation flow unchanged: yes
- seed/web files untouched: yes

## Files changed

- `apps/mcp-server/src/persistence.ts`
- `apps/mcp-server/src/tools.ts`
- `apps/mcp-server/src/persistence.test.ts`
- `.superpowers/sdd/task-2-report.md`

## Commit intent

Commit message used:

```text
feat: enforce bilingual assets at mcp boundary
```

## Remaining concern

None from this follow-up cycle.

## Review follow-up

Addressed the two Minor review items after the original Task 2 commit:

1. `renderPersistedAssetAsMarkdown(..., "zh")` now localizes only the visible heading and summary fields
2. The `Source JSON` block now emits the original canonical persisted payload, including preserved `localizedContent.zh`

This follow-up stayed within:

- `apps/mcp-server/src/persistence.ts`
- `apps/mcp-server/src/persistence.test.ts`
- `.superpowers/sdd/task-2-report.md`

### Added regression coverage

Expanded the focused persistence suite with a zh-render regression test that:

- renders markdown detail in `locale: "zh"`
- parses the `Source JSON` block
- asserts top-level persisted fields remain canonical English
- asserts `localizedContent.zh` is still present in the serialized payload

### Current verification evidence

Focused persistence test rerun after the review fix:

```text
✓ apps/mcp-server/src/persistence.test.ts (8 tests) 23ms
Test Files  1 passed (1)
Tests  8 passed (8)
```

Fresh MCP typecheck after the review fix:

```text
$ tsc -p tsconfig.json --noEmit
```

Exit code: `0`

Note: the earlier `7/7` Task 2 persistence evidence from the original implementation remains valid in the previous verification section; the suite is now `8/8` because of the new canonical-JSON regression test added for this review gate.
