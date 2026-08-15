# Designer 3A Candidate Review

## Candidate Batch

- Batch: `architecture-fact-batch:designer:3a:v1`
- Content digest: `a70168ecd52cec3cb7c19d8793332568b5e845f6abacfde32edbd890b0223fb2`
- Candidate counts: 4 units, 7 memberships, 3 mappings
- Review Bundle: `knowledge-review-bundle:designer:3a:v1`
- Decision: `knowledge-promotion-decision:designer:3a:v1` = `APPROVE`
- ChangeSet: `architecture-fact-changeset:120bb37962e124a6d155178bf7560f513ff9877bd35d5d5519481ada8a62ebcf`

## Units

| Layer | Unit identity | Kind | Evidence |
| --- | --- | --- | --- |
| BIZ | `unit:biz:specforge-governed-design-facts` | CAPABILITY | `domain-specforge-platform`, `adr-3a-architecture-navigation-workspace` |
| SYS | `unit:sys:specforge-mcp-governance-gateway` | SERVICE | `api-specforge-mcp-tools`, `api-specforge-3a-architecture-query` |
| SYS | `unit:sys:specforge-3a-projection-service` | SERVICE | `api-specforge-3a-projection-build`, `api-specforge-3a-architecture-query` |
| TECH | `unit:tech:specforge-postgresql-authority` | TECHNOLOGY_SERVICE | `data-specforge-assets`, `data-specforge-3a-projection-read-model`, `adr-postgresql-authoritative-design-store` |

Every unit has an English canonical name and description plus a complete Chinese name and description.

## Mappings

| Mapping | Direction | Mapping family | Relationship evidence | Confidence |
| --- | --- | --- | --- | --- |
| `mapping:unit:biz:specforge-governed-design-facts->unit:sys:specforge-mcp-governance-gateway` | BIZ -> SYS | CAPABILITY_TO_SERVICE | `domain:domain-specforge-platform:owns:datamodel:data-specforge-assets` | 0.96 |
| `mapping:unit:sys:specforge-mcp-governance-gateway->unit:tech:specforge-postgresql-authority` | SYS -> TECH | SERVICE_TO_TECHNOLOGY | `adr:adr-postgresql-authoritative-design-store:decides:datamodel:data-specforge-assets` | 0.98 |
| `mapping:unit:sys:specforge-3a-projection-service->unit:tech:specforge-postgresql-authority` | SYS -> TECH | SERVICE_TO_TECHNOLOGY | `api:api-specforge-3a-projection-build:writes:datamodel:data-specforge-3a-projection-read-model` | 0.99 |

## Promotion and Projection Receipts

- Promotion: `architecture-fact-promotion:knowledge-promotion-decision:designer:3a:v1:architecture-fact-batch:designer:3a:v1`
- Reconciliation: `knowledge-reconciliation:architecture-fact-promotion:knowledge-promotion-decision:designer:3a:v1:architecture-fact-batch:designer:3a:v1:7403fd284f496168434a5dc63f54c20960cfcdd4e7aeebc45f869a3d50de022b`, `CONVERGED`
- Baseline: `knowledge-baseline:designer:3a:v1`, `PUBLISHED`
- Projection Manifest: `projection-manifest:projection-generation:a8c14d5235eb4575ad606b8292c8a0d38bb48b4c4ee7d46495ef7a888295c72b:4`, `READY`
- Published projection: 4 units, 7 members, 3 mappings, derived analysis `PUBLISHED`.

## Explicit Non-Goals

This batch does not classify all existing APIs, events, rules, data models, or runtime facts. It does not implement legacy enterprise scanners, continuous inbound synchronization, cross-service views, external `APPLY`, or NebulaGraph scale certification. Those remain separately governed backlog work.

## 中文说明

本批候选包含 4 个架构单元、7 个成员归属和 3 条跨层映射，已通过 MCP 审核、提升、对账和投影发布。它只是证据充分的首个闭环切片，不代表已经完成所有存量系统语义识别；存量扫描、持续同步、跨服务视图、外部 APPLY 和图数据库规模认证仍保持为独立待办。
