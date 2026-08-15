# Designer 3A Coverage Expansion Evidence

## Scope

- Application service: `com.huawei.celon.desiner`
- Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Design Change Session: `design-change-session:8caa26ac-7f8b-477a-bce8-a44ea0e3990c`
- Previous Baseline: `knowledge-baseline:designer:3a:v3`
- Target Baseline: `knowledge-baseline:designer:3a:v4`

## Decision Boundary

This increment expands membership coverage only. It does not create a new BIZ, SYS, or TECH unit, infer a business meaning from a name, or create a new cross-layer mapping. Every candidate points to an existing persisted design asset and an already accepted architecture unit.

The following existing units remain authoritative:

- BIZ `unit:biz:specforge-governed-design-facts`
- SYS `unit:sys:specforge-mcp-governance-gateway`
- SYS `unit:sys:specforge-3a-projection-service`
- TECH `unit:tech:specforge-postgresql-authority`

## Evidence Matrix

| Existing design fact | Assigned unit | Reason | Decision |
| --- | --- | --- | --- |
| `api-specforge-knowledge-baseline-publication` | MCP governance gateway | MCP owns the governed publication boundary. | Accepted membership |
| `api-specforge-scanner-release-contract` | MCP governance gateway | MCP receives bounded scanner evidence. | Accepted membership |
| `rule-specforge-knowledge-promotion-transaction` | MCP governance gateway | The rule constrains promotion at the governance boundary. | Accepted membership |
| `rule-specforge-knowledge-risk-policy` | MCP governance gateway | The rule constrains review at the governance boundary. | Accepted membership |
| `rule-specforge-core-service-reuse` | MCP governance gateway | The rule governs reuse of the core service boundary. | Accepted membership |
| `api-specforge-3a-projection-build` | 3A projection service | The API is the projection build contract. | Accepted membership |
| `api-specforge-3a-architecture-query` | 3A projection service | The API is the projection query contract. | Accepted membership |
| `data-specforge-asset-graph` | PostgreSQL authoritative design store | Authored relationship state is authoritative in PostgreSQL. | Accepted membership |
| `data-specforge-scan-session` | PostgreSQL authoritative design store | Scan governance state is persisted in PostgreSQL. | Accepted membership |
| `data-specforge-scan-batch` | PostgreSQL authoritative design store | Resumable scan batches are persisted in PostgreSQL. | Accepted membership |
| `data-specforge-source-observation-v2` | PostgreSQL authoritative design store | Source observations are persisted in PostgreSQL. | Accepted membership |
| `data-specforge-i18n` | PostgreSQL authoritative design store | Human-facing bilingual overlays are persisted with design facts. | Accepted membership |
| `rule-specforge-3a-projection-publication` | PostgreSQL authoritative design store | Publication validates the derived PostgreSQL read model. | Accepted membership |
| `api-specforge-asset-upsert` | MCP governance gateway | The MCP boundary owns governed design-asset writes. | Accepted membership |
| `api-specforge-proposal-upsert` | MCP governance gateway | The MCP boundary owns governed Proposal writes. | Accepted membership |
| `api-specforge-context-pack-upsert` | MCP governance gateway | The MCP boundary owns governed Context Pack writes. | Accepted membership |
| `event-specforge-governance-check-completed` | MCP governance gateway | Governance completion is emitted from the MCP boundary. | Accepted membership |
| `event-specforge-context-pack-generated` | MCP governance gateway | Context Pack generation is tracked at the MCP boundary. | Accepted membership |
| `rule-bilingual-asset-completeness` | MCP governance gateway | Human-facing bilingual completeness is enforced at the write boundary. | Accepted membership |
| `data-specforge-audit` | PostgreSQL authoritative design store | MCP audit history is persisted in PostgreSQL. | Accepted membership |
| `data-specforge-mcp-registry` | PostgreSQL authoritative design store | MCP registry state is persisted in PostgreSQL. | Accepted membership |
| `data-specforge-ai-generation` | PostgreSQL authoritative design store | AI generation requests and outputs are persisted in PostgreSQL. | Accepted membership |
| `data-specforge-web-workspace` | PostgreSQL authoritative design store | Web workspace state is persisted in PostgreSQL. | Accepted membership |

## MCP Receipts

The batch, review, approval, promotion, reconciliation, Baseline, and projection receipts are emitted by:

```text
pnpm exec tsx scripts/expand-designer-3a-coverage.ts
```

The script uses MCP for every authored write and is idempotent by batch, review, decision, promotion, and Baseline IDs. The final complete-snapshot batch preserves the original chain as new revisions so the v4 Baseline does not drop existing units or mappings.

The previous failed additive attempt was rejected at the Baseline gate because it did not carry the prior revision set. No incomplete Baseline was published. The v4 read-back command returned `status=READY`, 4 units, 28 members, 3 mappings, `unclassifiedCount=0`, and `scopeMatches=true`.

## Verification Record

- `pnpm exec tsx scripts/expand-designer-3a-coverage.ts` -> MCP batch `architecture-fact-batch:designer:3a:coverage:v4`, review `READY`, promotion `APPROVE`, reconciliation `CONVERGED`, Baseline `PUBLISHED`.
- `pnpm exec tsx scripts/process-designer-3a-projection.ts` -> projection `READY`, derived analysis `PUBLISHED`.
- `pnpm exec tsx scripts/verify-designer-3a-coverage.ts` -> 4 units, 28 members, 3 mappings, `totalByLayer={BIZ:1,SYS:2,TECH:1}`, `unclassifiedCount=0`, exact Scope match.
- `pnpm design-facts:sync` followed by `pnpm design-facts:check` -> 23 verified ADR facts; missing, mismatched, out-of-scope, and blocked lists are empty.
- `pnpm typecheck` and `git diff --check` are the final local checks for this repository change; the matching MCP session is closed only after both return exit code 0.

## Deferred Coverage

Remaining APIs, events, rules, data models, runtime facts, source-owner confirmation, ambiguous semantic classifications, and live connector synchronization remain deferred in `docs/TODO.md`. They require their own evidence matrix and exact-Scope batch; this increment does not claim enterprise-wide 3A completeness.
