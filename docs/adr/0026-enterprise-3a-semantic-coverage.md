# ADR-0026: Enterprise 3A Semantic Coverage Projection

## Status

**Implemented for the exact Designer application-service Scope.** The v6 structural architecture baseline remains unchanged. Continuous legacy scanning, external synchronization, cross-Scope comparison, and external `APPLY` remain deferred.

- Stable ID: `adr-enterprise-3a-semantic-coverage`
- Owning application service: `com.huawei.celon.desiner`
- Owning Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Design Change Session: `design-change-session:3f60911b-4a6e-49d8-977d-0391dcea39f3`
- Written Spec: `docs/superpowers/specs/2026-08-16-enterprise-3a-semantic-coverage-design.md`
- Implementation Plan: `docs/superpowers/plans/2026-08-16-enterprise-3a-semantic-coverage.md`

## Context

The exact Designer Scope contains 297 authored records, while the reviewed v6 architecture baseline contains 8 units, 42 direct memberships, and 6 cross-layer mappings. These are different concerns: a design record can be a structural member, a governance record that traces to a member, or an explicit unresolved case.

## Decision

Use an immutable `generic-system@2` coverage projection alongside the v6 architecture baseline.

- PostgreSQL is authoritative for authored catalog revisions, relationship events, build jobs, manifests, and coverage rows.
- Each generation is pinned to exact Scope, catalog waterline, relationship waterline, baseline, profile, and query input.
- Coverage roles are `MEMBERSHIP`, `TRACEABILITY`, and `EXEMPTION`; statuses are `COVERED`, `BLOCKED`, and `NOT_EVALUATED`.
- Traceability uses only declared directed relationship grammars and a maximum of three relationship hops.
- MCP exposes idempotent build request/status and bounded paginated report reads; the web workspace shows freshness, summary, and detail rows.
- Graph databases remain derived projections and are not required for coverage correctness.
- English is canonical for decision content and Chinese is stored as the complete human-facing localized overlay.

The materializer uses the membership revisions referenced by the official v6 baseline manifest. It does not treat every accepted historical revision as a current member set, preventing false `AMBIGUOUS_MEMBERSHIP` results from older revisions.

## Alternatives Rejected

1. Promote all authored records into a new architecture baseline. This would change accepted architecture meaning and collapse governance into structure.
2. Compute coverage through live graph traversal. This would make historical answers unstable and introduce unnecessary runtime dependency on graph availability.

## Evidence

The six verified relationship gaps were repaired through MCP only. The final generation was built and read back through MCP in the exact Scope:

- Catalog waterline: `303`
- Relationship waterline: `7664`
- Coverage generation: `coverage-generation:designer:3a:v10`
- Coverage manifest: `coverage-manifest:coverage-generation:designer:3a:v10`
- Result: `297/297 COVERED`, `0 BLOCKED`, `0 NOT_EVALUATED`, `CURRENT`
- Maximum stored path: `3` hops
- v6 regression: `8` units, `42` memberships, `6` mappings, `READY`

Exact commands and outputs are recorded in [enterprise-3a-semantic-coverage-evidence.md](../evidence/enterprise-3a-semantic-coverage-evidence.md).

## Consequences

Coverage is reproducible and historical, and stale catalog or relationship waterlines are visible. Unsupported semantics remain explicit rather than being guessed. A future policy version or continuous worker can be added as a new generation without mutating this published result.

## 中文说明

本决策在精确 Designer 应用服务 Scope 内实施不可变的 `generic-system@2` 覆盖投影，保留 v6 的 8 个架构单元、42 个成员和 6 个映射不变。PostgreSQL 是设计事实、关系事件、构建任务、清单和覆盖行的权威存储；图数据库仅作为派生投影。当前验证结果为 297/297 条记录覆盖，0 条阻塞，0 条未评估，最大路径为 3 跳。存量扫描、持续外部同步、跨 Scope 比较和外部 APPLY 不属于本阶段。
