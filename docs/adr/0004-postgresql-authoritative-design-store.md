# ADR 0004: PostgreSQL as the Authoritative Design Store

## Status

- Stable ID: `adr-postgresql-authoritative-design-store`
- Status: Accepted
- Implementation status: PostgreSQL persistence for scoped design assets, current relationships, relationship events, audit records, and graph checkpoints is implemented and locally verified. Production-scale operational hardening is deferred.
- Owning `architectureScope`: `applicationServiceId=com.huawei.celon.desiner`; `scopePath=pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

中文本地化状态：

- 稳定 ID：`adr-postgresql-authoritative-design-store`
- 状态：已接受
- 实现状态：面向有范围设计资产、当前关系、关系事件、审计记录和图检查点的 PostgreSQL 持久化已经实现并完成本地验证；生产规模的运维加固延期处理。
- 所属 `architectureScope`：`applicationServiceId=com.huawei.celon.desiner`；`scopePath=pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

## Context

SpecForge must preserve authored design facts, relationship history, auditability, and reproducible derived views. MCP writes need one transactional authority that can enforce exact application-service scope and support local development, automated tests, and small installations. A graph query engine may optimize traversal, but it must not become an independent authoring source.

中文本地化背景：

SpecForge 必须保存由人或 Agent 编写的设计事实、关系历史、审计能力以及可复现的派生视图。MCP 写入需要一个事务权威源，用于强制精确的应用服务范围，并支持本地开发、自动化测试和小规模部署。图查询引擎可以优化遍历，但不能成为独立的编写来源。

## Decision

PostgreSQL is the authoritative transactional store for the selected application-service scope. MCP, parsers, and importers write through validated services that persist design assets, asset-node identity, current typed relationships, append-only relationship events, audit records, outbox events, projection checkpoints, and impact-analysis runs as applicable. The write and its relationship event/outbox record commit atomically. Graph stores consume those events or rebuild from PostgreSQL state and remain replaceable projections.

All reads and writes carry the exact `architectureScope`; `applicationServiceId` and `scopePath` must match. PostgreSQL remains the source used to verify canonical English fields, complete Chinese overlays, relationship provenance, and the graph version used by derived analysis.

中文本地化决策：

PostgreSQL 是所选应用服务范围内的事务权威存储。MCP、解析器和导入器通过经过验证的服务写入，并按适用情况持久化设计资产、资产节点身份、当前有类型关系、追加式关系事件、审计记录、事务外发事件、投影检查点和影响分析运行记录。写入及其关系事件或外发记录在同一事务中原子提交。图存储消费这些事件，或从 PostgreSQL 状态重建，并始终作为可替换的派生投影。

所有读写都携带精确的 `architectureScope`；`applicationServiceId` 与 `scopePath` 必须匹配。PostgreSQL 仍是核验英文规范字段、完整中文覆盖、关系来源以及派生分析所用图版本的来源。

## Alternatives

1. **Use a graph database as the system of record.** Rejected because authored facts, transactional audit history, and exact replay semantics are relational write concerns; graph availability or schema changes must not redefine authored truth.
2. **Use repository Markdown as the only source.** Rejected because files are reviewable but do not provide scoped transactional writes, queryable relationship history, or MCP audit records.
3. **Dual-write PostgreSQL and a graph store synchronously.** Rejected because it creates two write authorities and makes partial failure resolution part of every authoring request.

中文本地化替代方案：

1. **使用图数据库作为系统记录源。** 拒绝，因为设计事实、事务审计历史和精确重放属于关系型写入职责；图数据库的可用性或模式变更不能重新定义编写事实。
2. **只使用仓库 Markdown 作为来源。** 拒绝，因为文件适合审查，但不能提供有范围的事务写入、可查询的关系历史或 MCP 审计记录。
3. **同步双写 PostgreSQL 和图存储。** 拒绝，因为这会产生两个写入权威，并使部分失败解决成为每次编写请求的负担。

## Consequences

- Authored facts have one transactional authority and an auditable history.
- Derived graph data can be rebuilt after loss or schema migration, at the cost of projection lag and rebuild capacity.
- PostgreSQL schema, indexes, partitions, retention, backups, and restore procedures become operational responsibilities.
- Small installations can use bounded PostgreSQL traversal; enterprise traversal can use a derived graph runtime without changing authoring semantics.

中文本地化后果：

- 编写事实拥有单一事务权威和可审计历史。
- 图派生数据丢失或模式迁移后可以重建，但需要承担投影延迟和重建容量成本。
- PostgreSQL 模式、索引、分区、保留策略、备份和恢复流程成为运维责任。
- 小规模部署可以使用有边界的 PostgreSQL 遍历；企业级遍历可以使用派生图运行时，而不改变编写语义。

## Constraints

- Scope is limited to `com.huawei.celon.desiner` and the exact scope path stated above; no implicit global aggregate is allowed.
- PostgreSQL is authoritative for authored assets and relationship events. A graph store cannot accept direct MCP, Web, or Agent authoring writes.
- Writes must remain typed, validated, audited, bilingual where human-facing, and compatible with existing MCP asset IDs.
- Relationship events and outbox records must be idempotent and replayable; derived consumers must tolerate duplicate delivery.
- Cross-application-service comparison and production deployment hardening remain deferred and require explicit authorization and design facts.

中文本地化约束：

- 范围仅限于 `com.huawei.celon.desiner` 以及上面列出的精确范围路径；不允许隐式全局聚合。
- PostgreSQL 对编写资产和关系事件保持权威。图存储不能接受 MCP、Web 或 Agent 的直接编写。
- 写入必须保持有类型、经过验证、可审计；面向人的内容还必须双语，并兼容既有 MCP 资产 ID。
- 关系事件和外发记录必须幂等且可重放；派生消费者必须能够处理重复投递。
- 跨应用服务比较和生产部署加固仍然延期，必须有明确授权和设计事实后才能进行。

## Evidence

- `pnpm --filter @specforge/core test` — local core tests cover scoped persistence semantics, relationship extraction, graph-store contracts, and impact analysis.
- `pnpm --filter @specforge/graph-store test` — local graph-store tests cover PostgreSQL traversal/projection behavior through the adapter contract.
- `DATABASE_URL=postgresql://admin:admin@localhost:5433/specforge?schema=public SPECFORGE_PG_INTEGRATION=1 pnpm --filter @specforge/graph-store test -- postgres.integration.test.ts` — completed on 2026-07-19 against the local PostgreSQL database; 3 test files and 51 tests passed, including disposable-schema traversal and relationship integration coverage.
- `pnpm --filter @specforge/mcp-server smoke` — local MCP smoke path exercises scoped reads, persisted writes, graph resources, and relationship evidence when the configured database is available.
- `prisma/schema.prisma` — PostgreSQL is the configured Prisma provider and models include persisted assets and relationship/projection records.

中文本地化证据：

- `pnpm --filter @specforge/core test` — 本地 Core 测试覆盖范围持久化语义、关系提取、图存储契约和影响分析。
- `pnpm --filter @specforge/graph-store test` — 本地图存储测试通过适配器契约覆盖 PostgreSQL 遍历和投影行为。
- `DATABASE_URL=postgresql://admin:admin@localhost:5433/specforge?schema=public SPECFORGE_PG_INTEGRATION=1 pnpm --filter @specforge/graph-store test -- postgres.integration.test.ts` — 已于 2026-07-19 在本地 PostgreSQL 数据库完成；3 个测试文件和 51 个测试通过，其中包含可自动清理 schema 的遍历和关系集成覆盖。
- `pnpm --filter @specforge/mcp-server smoke` — 在配置的数据库可用时，本地 MCP 冒烟路径验证有范围读取、持久化写入、图资源和关系证据。
- `prisma/schema.prisma` — Prisma 配置的提供程序是 PostgreSQL，模型包含持久化资产以及关系或投影记录。

## Reconciliation Update (2026-07-19)

This update supersedes earlier baseline-governance synchronization deferrals. The ADR, matching Proposal/Context Pack, typed links, and Evidence are persisted and read back through MCP in the exact Designer scope. Production-scale operational hardening and explicitly authorized cross-service comparison remain deferred.

### 对账更新（2026-07-19）

本更新覆盖此前基线治理同步延期的描述。ADR、关联 Proposal/Context Pack、类型化关系和 Evidence 现已在精确 Designer Scope 中通过 MCP 持久化并回读。生产级运维加固和经明确授权的跨服务比较仍保持延期。

## MCP Record

- Matching MCP ADR ID: `adr-postgresql-authoritative-design-store`
- Exact `architectureScope`: `applicationServiceId=com.huawei.celon.desiner`; `scopePath=pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Related Proposal: `proposal-specforge-self-design`
- Related Context Pack: `context-pack-specforge-self-design`
- Related assets: `data-specforge-assets`, `data-specforge-asset-graph`, `api-specforge-mcp-tools`, `quality-specforge-impact-ready`
- Typed links: `implements`, `governs`, and `provides-authoritative-store-for`, with all endpoints in the exact scope.
- Evidence references: the commands and repository paths listed in `Evidence`.
- MCP synchronization blocked: no MCP write and read-back verification was available in this documentation-only task. Retry trigger: persist this ADR through the scoped `create_adr` MCP operation, persist the listed typed links, and read back the ID, scope, canonical English fields, Chinese overlay, targets, and evidence.

中文本地化 MCP 记录：

- 匹配的 MCP ADR ID：`adr-postgresql-authoritative-design-store`
- 精确 `architectureScope`：`applicationServiceId=com.huawei.celon.desiner`；`scopePath=pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 相关 Proposal：`proposal-specforge-self-design`
- 相关 Context Pack：`context-pack-specforge-self-design`
- 相关资产：`data-specforge-assets`、`data-specforge-asset-graph`、`api-specforge-mcp-tools`、`quality-specforge-impact-ready`
- 有类型关系：`implements`、`governs` 和 `provides-authoritative-store-for`，所有端点都必须位于精确范围内。
- 证据引用：使用 `Evidence` 章节列出的命令和仓库路径。
- MCP 同步受阻：本次仅处理文档，无法执行 MCP 写入和回读核验。重试触发条件：通过有范围的 `create_adr` MCP 操作持久化本 ADR，持久化列出的有类型关系，并回读核验 ID、范围、英文规范字段、中文覆盖、目标和证据。
