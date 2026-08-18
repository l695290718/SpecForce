# Enterprise 3A Semantic Coverage Evidence

## Scope

- `applicationServiceId`: `com.huawei.celon.desiner`
- `scopePath`: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Design Change Session: `design-change-session:5410ed42-32a0-49e0-a9ac-1c9f25d42f09`

## Commands and Results

| Command | Result |
| --- | --- |
| `pnpm catalog:bootstrap` | Appended `293` missing initial catalog revisions; the catalog later advanced to `303` after the four MCP design facts were synchronized. |
| `pnpm exec tsx scripts/repair-enterprise-3a-coverage-links.ts` | Created `11` exact-Scope MCP links; blocked `0`. |
| `pnpm enterprise-3a:build` | Coverage generation `v11` published; Job `READY`; persisted error and diagnostic fields are empty. |
| `pnpm enterprise-3a:verify` | `CURRENT`; `303` rows; `303 COVERED`; `0 BLOCKED`; `0 NOT_EVALUATED`; maximum path `3`. |
| `pnpm exec tsx scripts/verify-designer-3a-v6.ts` | v6 `READY`; `8` units; `42` memberships; `6` mappings; v5 regression `4/38/3`. |
| `pnpm exec vitest run apps/mcp-server/src/knowledge/coverage-report.test.ts apps/knowledge-projector/src/coverage-materializer.test.ts packages/core/src/coverage/policy.test.ts` | `3` files; `11` tests passed. |
| `pnpm --filter @specforge/mcp-server typecheck` | Passed. |
| `pnpm --filter @specforge/knowledge-projector typecheck` | Passed. |
| `pnpm enterprise-3a:verify` after MCP design-fact synchronization | Passed; the synchronized design facts do not change the pinned coverage generation, which remains `CURRENT`. |

## Final Coverage Readback

- Coverage generation: `coverage-generation:designer:3a:v11`
- Manifest: `coverage-manifest:coverage-generation:designer:3a:v11`
- Catalog version: `303`
- Relationship version: `7675`
- Rows: `303`
- Covered: `303`
- Blocked: `0`
- Not evaluated: `0`
- Freshness: `CURRENT`
- Maximum path hops: `3`

## Governance Synchronization

The following facts are written through MCP using the exact owning Scope and read back by stable ID:

- ADR: `adr-enterprise-3a-semantic-coverage`
- Proposal: `proposal-enterprise-3a-semantic-coverage`
- Context Pack: `ctx-enterprise-3a-semantic-coverage`
- Evidence: `evidence-enterprise-3a-semantic-coverage`

Typed links include `IMPLEMENTS_DECISION`, `IMPLEMENTS_CONTEXT_FOR`, `VALIDATES`, and `DECIDES` links to the affected catalog, projection, MCP, and quality assets.

## 中文摘要

本次验证只针对精确 Designer Scope。目录水位线为 303，关系水位线为 7675，覆盖代次 v11 当前有效，303 条记录全部 COVERED，没有 BLOCKED 或 NOT_EVALUATED，路径上限为 3 跳。v6 结构基线仍为 8/42/6。所有 ADR、Proposal、Context Pack、Evidence 和类型关系通过 MCP 写入并按稳定 ID 读回。
