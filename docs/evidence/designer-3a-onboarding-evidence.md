# Designer 3A Onboarding Evidence

## Scope

- English canonical Scope: `com.huawei.celon.desiner`
- Full Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Design Change Session: `design-change-session:fa68fdd5-8d04-4e64-a111-8e4c71f69a54`
- PostgreSQL authority: Docker PostgreSQL at `localhost:15433/specforge_canonical`

## Source Inventory

The inventory was read through the MCP catalog in the exact Designer Scope. These persisted assets and typed links are the evidence boundary for the first batch:

| Source ID | Type | English meaning | Chinese overlay | Use |
| --- | --- | --- | --- | --- |
| `domain-specforge-platform` | Domain | SpecForge Platform Domain | SpecForge 平台领域 | BIZ capability evidence |
| `api-specforge-mcp-tools` | API | SpecForge MCP Tool Contract | SpecForge MCP 工具契约 | SYS governance boundary |
| `api-specforge-3a-architecture-query` | API | 3A Architecture Query Contract | 3A 架构查询契约 | SYS read service |
| `api-specforge-3a-projection-build` | API | 3A Projection Build Contract | 3A 投影构建契约 | SYS projection service |
| `data-specforge-assets` | Data Model | SpecForge Design Asset Data Model | SpecForge 设计资产数据模型 | TECH authority |
| `data-specforge-3a-projection-read-model` | Data Model | 3A Projection Read Model | 3A 投影读模型 | TECH derived read model |
| `adr-3a-architecture-navigation-workspace` | ADR | 3A Architecture Navigation Workspace | 3A 架构导航工作区 | projection boundary |
| `adr-postgresql-authoritative-design-store` | ADR | PostgreSQL as the Authoritative Design Store | PostgreSQL 作为权威设计存储 | authority boundary |

## Relationship Evidence

- `domain:domain-specforge-platform:owns:datamodel:data-specforge-assets`
- `adr:adr-postgresql-authoritative-design-store:decides:datamodel:data-specforge-assets`
- `api:api-specforge-3a-projection-build:writes:datamodel:data-specforge-3a-projection-read-model`

The relationship catalog was filtered by the same exact Scope. No sibling application-service asset was used.

## Verification

- `pnpm db:push` -> Prisma schema synchronized with Docker PostgreSQL and generated the Prisma Client.
- `pnpm exec tsx scripts/inspect-designer-catalog.ts` -> live assets and typed links read through MCP.
- `pnpm exec tsx scripts/bootstrap-designer-3a.ts` -> MCP batch, Review Bundle, approval, promotion, reconciliation, Baseline, and projection request completed; retries were idempotent for the batch and review records.
- `pnpm exec tsx scripts/process-designer-3a-projection.ts` -> projection `READY`, Manifest published, derived analysis `PUBLISHED`.
- Projection read-back -> 4 units, 7 members, 3 mappings; BIZ=1, SYS=2, TECH=1.

## Coverage Boundary

This is the initial evidence-backed slice, not a claim that every enterprise semantic has been classified. Unclassified or ambiguous source facts remain outside the batch and should be handled by a later governed revision with its own evidence and review.

## 中文说明

本记录描述 `com.huawei.celon.desiner` Scope 的首批 3A 架构事实铺底。所有来源均通过精确 Scope 的 MCP 目录读取，英文是规范字段，中文覆盖面向人展示。首批数据已经通过 MCP 提交、审核、提升、对账、Baseline 发布和投影回读；未明确的企业语义没有被猜测写入，后续需要新的证据和审核批次。
