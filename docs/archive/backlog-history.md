# SpecForge Backlog History

This file preserves completed, superseded, and resolved backlog records. Active work is tracked in [`docs/TODO.md`](../TODO.md). Detailed decisions, design facts, and operational evidence remain authoritative in the linked ADRs, the design-fact manifest, and MCP records.

The archive is historical. An item listed here does not imply that related production capabilities are complete. Deferred extensions remain in the active backlog.

## Completed Governance And Deployment Increments

### Design-fact dual-record synchronization and historical ADR reconciliation

- **Outcome:** Completed repository governance, MCP persistence, bilingual record reconciliation, typed links, and Evidence read-back for the baseline decisions.
- **Stable references:** ADR-0007 (`adr-design-fact-dual-record-governance`), ADR-0001 through ADR-0006 historical status reconciliations, and `docs/design-facts/baseline-manifest.json`.
- **Evidence:** `pnpm design-facts:sync` persisted the baseline records and Evidence/`VALIDATES` links; `pnpm design-facts:check` verified the synchronized decisions with no missing, mismatched, out-of-scope, or blocked records. Later production graph and product-capability deferrals remain governed by their respective ADRs.

### Federated governance core and hardening slices

- **Outcome:** Completed the federated design-fact envelope, exact-Scope authorization, candidate binding, audit recovery, transactional delivery, connector readiness, source-version determinism, reconciliation ordering, and audit redaction contracts.
- **Stable references:** ADR-0010 (`adr-federated-design-fact-synchronization`), its matching Proposal and Context Pack, six manifest-declared Evidence assets, and the federation hardening records.
- **Evidence:** The Docker PostgreSQL authority at `localhost:5433/specforge` was used for MCP synchronization and read-back. The eight-decision reconciliation and exact-Scope federation check returned `blocking: false` with no issue counts. The persisted audit failure contract is `FEDERATION_TOOL_ERROR;diagnosticRef=<64-hex SHA-256 digest>`; raw exception and credential text are excluded from `AuditLog.errorMessage`.

### Single-host Docker Compose deployment

- **Outcome:** Completed the separately packaged Web and authoritative PostgreSQL Docker Compose deployment. PostgreSQL uses the `specforge_pgdata` named volume and remains private to the Compose network; Web can later use an external `DATABASE_URL`.
- **Stable references:** ADR-0011 (`adr-single-host-docker-compose-deployment`), `deploy/compose.yaml`, and the deployment verification scripts.
- **Evidence:** `powershell -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1 -ConfigurationOnly` passed; the production Web image built; and `powershell -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1 -Live` passed health and Web-restart persistence verification on an isolated port-3010 stack. `pnpm design-facts:check` read back the deployment decision without missing, mismatched, out-of-scope, or blocked records.

### Architecture overview home and MCP synchronization

- **Outcome:** Completed the bilingual, scope-safe architecture overview page and its relationship-led navigation. The root page explains SpecForge positioning without loading, counting, or aggregating cross-application-service design facts.
- **Stable references:** ADR-0013 (`adr-architecture-overview-home`), the backlog record `Synchronize architecture overview design facts`, and the matching Proposal, Context Pack, Evidence, and typed links.
- **Evidence:** The focused overview and manifest tests passed 2 files and 17 tests; the Web lint passed with exit code 0; and `pnpm design-facts:sync` followed by `pnpm design-facts:check` persisted and read back the exact IDs, Scope, localization, typed links, and evidence.

### Single authoritative local PostgreSQL migration

- **Outcome:** Completed the local migration to one authoritative PostgreSQL source for authored SpecForge data and relationship events. Graph stores remain derived projections.
- **Stable references:** ADR-0014 (`adr-single-authoritative-local-postgresql`) and the canonical Docker PostgreSQL deployment records.
- **Evidence:** The canonical PostgreSQL connection was used for local Web and MCP behavior, and the matching design-fact records were synchronized and read back. The legacy verification database was retained only as a separately governed rollback or verification source where the ADR requires it.

## Completed Knowledge And 3A Increments

### Agent-driven legacy Baseline discovery Phase 1

- **Outcome:** Completed signed, source-minimized, resumable legacy discovery through an authorized coding Agent and MCP. The scanner does not receive PostgreSQL credentials, does not execute repository code, and writes only to one exact application-service Scope.
- **Stable references:** ADR-0015 (`adr-agent-driven-legacy-baseline-discovery`), Proposal `proposal-agent-driven-legacy-baseline-discovery`, and Context Pack `context-pack-agent-driven-legacy-baseline-discovery`.
- **Evidence:** `pnpm legacy-baseline:verify` exited `0`; `artifacts/legacy-baseline-verification.json` recorded all ten checks as `PASSED`, including contract drift, Go tests/build, Core tests, scanner/knowledge tests, PostgreSQL integration, signed-binary end-to-end behavior, 100,000-observation scale, typecheck, and production build. Phase 1 also covered checkpoint resume, bilingual review, actor separation, atomic promotion, reconciliation, immutable Baseline publication, stable rescan IDs, and sibling-Scope isolation.
- **Boundary:** Continuous CI observation, live database/API-gateway/CMDB/runtime connectors, 3A projections, CodeHub enforcement, outbound proposals, external `APPLY`, and complete billion-scale certification are separate phases and are not archived as complete.

### Deterministic 3A projections Phase 2

- **Outcome:** Completed the deterministic BIZ/SYS/TECH projection contract, exact-Scope MCP derive operation, Baseline drift representation, and pinned Context Pack behavior.
- **Stable references:** ADR-0019 (`adr-deterministic-3a-knowledge-projections`) and `docs/superpowers/plans/2026-08-03-deterministic-3a-projections.md`.
- **Evidence:** The projection contract and exact-Scope MCP operations were focused-tested and synchronized through MCP with read-back. Projection generation is bounded, Baseline-bound, and derived from PostgreSQL-authoritative Knowledge Assertions and relationship events.
- **Boundary:** The later Knowledge-Assertion-aware Nebula projection, production identity, cross-application-service comparison, multi-node sizing, and billion-scale certification remain active deferred capabilities.

### Continuous-observation governance core and local-repository connector Phase 3

- **Outcome:** Completed the provider-neutral receiving boundary, durable PostgreSQL cursors, bounded hash-chained batch receipts, exact-Scope MCP authorization, idempotent candidate observation persistence, transactional federation outbox behavior, and a local repository source adapter with resumable connector runtime.
- **Stable references:** ADR-0020 (`adr-continuous-observation-governance`) and `docs/superpowers/plans/2026-08-03-continuous-observation-governance.md`.
- **Evidence:** `pnpm db:push` synchronized the cursor and batch schema to Docker PostgreSQL at `localhost:15433`; the focused Core and MCP suites passed 41 tests; the gated real PostgreSQL transaction suite passed first acceptance, identical retry, cursor read-back, sequence-gap rejection, and cleanup; and the Web service returned HTTP 200.
- **Boundary:** Concrete database/API/CMDB/runtime adapters, live polling or webhooks, automatic candidate promotion, outbound proposals, and external `APPLY` remain deferred.

### PostgreSQL-first 3A navigation workspace and canonical acceptance gate

- **Outcome:** Completed the read-only `/architecture/3a` workspace, 3A v2 projection read model, leased asynchronous Knowledge Projector, bounded query service, exact-Scope MCP operations, provider-neutral Web principal boundary, bilingual lane/list/detail/alignment/drift views, and Docker deployment wiring.
- **Stable references:** ADR-0022 (`adr-3a-architecture-navigation-workspace`), ADR-0019, ADR-0018, Proposal `proposal-3a-architecture-navigation-workspace`, Context Pack `ctx-3a-architecture-navigation-workspace`, and the matching managed assets and Evidence.
- **Evidence:** Core, Query, Projector, MCP, and Web focused suites passed; the five package typechecks passed; the production build and Compose configuration passed; the canonical Docker PostgreSQL Projector end-to-end test passed Baseline publication, lease restart recovery, bounded queries, cursor replay denial, tracing, alignment, drift, sibling-Scope denial, and cleanup; and browser acceptance passed at desktop `1280x720` and mobile `509x642`. The authorized Designer Scope rendered the workspace and the sibling PolicyHub Scope returned access denied.
- **Legacy catalog bootstrap evidence:** The exact Designer Scope contained 194 bilingual authored records and 277 usable typed links. MCP-only `bootstrap_3a_from_design_assets` produced BIZ 28, SYS 39, and TECH 127 assertions; the published 3a.v2 projection contained 471 nodes and 277 edges. The Designer page returned HTTP 200 without the empty-projection state, and the sibling Scope contained no Designer Baseline identifier. Session `design-change-session:9d2b9760-f252-40a7-b882-a8dc503b6ab5` closed `CONVERGED`; two rolled-back retries were closed `BLOCKED` with explicit retry reasons.

## Completed Graph Increments

### PostgreSQL graph traversal and transactional outbox regressions

- **Outcome:** Completed the PostgreSQL-backed graph traversal contract and deterministic root-ordering regression. PostgreSQL remains authoritative for relationship history, outbox rows, checkpoints, and audit evidence; graph stores remain derived.
- **Stable references:** ADR-0005 (`adr-nebulagraph-derived-impact-runtime`) and ADR-0006 (`adr-transactional-outbox-graph-projection`).
- **Evidence:** `DATABASE_URL=postgresql://admin:admin@localhost:5433/specforge?schema=public SPECFORGE_PG_INTEGRATION=1 pnpm --filter @specforge/graph-store test -- postgres.integration.test.ts` passed 3 test files and 51 tests, including the disposable PostgreSQL integration suite. The matching ADR, Proposal, Context Pack, typed links, and Evidence were later reconciled through MCP; production graph deployment remains separately governed.

### Legacy graph-outbox archival

- **Outcome:** Archived historical nonterminal `legacy-enterprise` outbox rows without deleting payloads, events, or diagnostics.
- **Stable references:** The `Resolve legacy graph-outbox migration state` record in `docs/TODO.md`, the graph projection ADRs, and the completed `AuditLog` receipt `archive_legacy_graph_outbox`.
- **Evidence:** `DATABASE_URL=<canonical> pnpm graph-outbox:archive` reported 330 eligible rows; `pnpm graph-outbox:archive --apply` changed only `legacy-enterprise` PENDING, DELIVERING, and DEAD_LETTER rows to `ARCHIVED`. The post-check reported `legacy-enterprise|ARCHIVED|330`, `legacy-enterprise|COMPLETED|408`, and a completed audit entry. Any future re-projection requires a separately approved, same-Scope replay policy.

### Local single-node NebulaGraph compatibility projection

- **Outcome:** Completed the local compatibility topology for NebulaGraph runtime components, authoritative outbox projection, checkpoints, traversal, restart recovery, idempotent replay, and MCP read-back.
- **Stable references:** ADR-0012 (`adr-nebulagraph-production-projection`), ADR-0005, and ADR-0006.
- **Evidence:** `powershell -ExecutionPolicy Bypass -File deploy/graph/verify-projection.ps1 -Live` passed the exact-Scope MCP fixture, `RelationshipOutbox` completion, checkpoint `13`, two-hop traversal with 3 nodes and 2 edges, Projector restart, idempotent replay with one logical edge and `eventCount=1`, and zero dead letters.
- **Boundary:** External Nebula clusters, multi-node production sizing, Kubernetes deployment, enterprise secret management, and billion-scale certification remain active deferred capabilities in `docs/TODO.md`.

### Legacy graph verification stack retirement

- **Outcome:** Completed the reversible retirement of the legacy graph-verification runtime. No `specforge-graph-verify-*` PostgreSQL container or volume remains active, all retained Projectors target `deploy-postgres-1/specforge_canonical`, and all local graph-verification services are stopped while their containers and Nebula volumes remain available for rollback inspection.
- **Stable references:** ADR-0012 (`adr-nebulagraph-production-projection`), ADR-0014 (`adr-single-authoritative-local-postgresql`), and Design Change Session `design-change-session:44d17797-b9e1-4594-b938-5027c7ea4583`.
- **Evidence:** The preserved custom-format backup `artifacts/db-consolidation/2026-07-29/source-graph-verify.dump` has SHA-256 `525BF44496C212CEE7330EB1927C965AB32FF3FE82F11AD608AA4C7E962481DF` and `pg_restore --list` returned 174 TOC entries. The final exact-Scope live gate completed graph version 17 with checkpoint 18, 3 traversal nodes, 2 traversal edges, one idempotent event, zero backlog, zero retries, and zero dead letters. Post-retirement inspection found every graph and Nebula container stopped, both historical Nebula volume sets retained, and `deploy-postgres-1` plus the MCP PostgreSQL tunnel still running.
- **Boundary:** This retirement closes only the obsolete local verification topology. External clusters, production-scale certification, and Knowledge-Assertion-aware Nebula projection remain deferred.

### 旧图验证栈退役

- **结果：** 已完成旧图验证运行时的可逆退役。当前不存在活跃的 `specforge-graph-verify-*` PostgreSQL 容器或卷；保留的 Projector 均指向 `deploy-postgres-1/specforge_canonical`。所有本地图验证服务均已停止，但容器和 Nebula 卷仍保留用于回滚核查。
- **证据：** 保留的自定义格式备份可由 `pg_restore --list` 读取，共 174 个 TOC 条目。最终精确 Scope live 门禁完成图版本 17、检查点 18、3 个遍历节点和 2 条边；幂等事件数为 1，积压、重试和死信均为 0。退役后，权威 PostgreSQL 与 MCP 隧道继续运行。
- **边界：** 本次只关闭旧的本地验证拓扑；外部集群、生产规模认证和 Knowledge Assertion 感知的 Nebula 投影仍为延期能力。

## Resolved Incidents

### Canonical PostgreSQL tunnel outage

- **Outcome:** The temporary `localhost:15433` Docker PostgreSQL tunnel outage was recovered. Subsequent exact-Scope governance sessions closed `CONVERGED`, and design-fact checks returned clean results.
- **Stable references:** The resolved incident receipt in `docs/TODO.md`, ADR-0010, ADR-0014, and the exact-Scope governance session records.
- **Evidence:** After the canonical Docker PostgreSQL authority and tunnel were started, `pnpm design-facts:check` verified all 19 decisions with empty issue lists, and exact-Scope federation reconciliation returned `blocking:false`.
- **Remaining work:** Bounded retry and operator-visible diagnostic hardening remains active backlog work. Recovery of this incident does not imply that resilience hardening is complete.

## 中文历史摘要

本文件保留已完成、已替代和已解决的待办历史；当前未完成工作继续记录在 [`docs/TODO.md`](../TODO.md)。详细决策、设计事实和运行证据以对应 ADR、设计事实基线清单和 MCP 记录为准。

### 已完成的治理与部署增量

- **双重设计事实记录与历史 ADR 对账：** ADR-0007 及 ADR-0001 至 ADR-0006 的历史状态已完成仓库治理、MCP 持久化、双语回读、有类型关系和 Evidence 对账。
- **联邦治理核心与加固轮次：** ADR-0010 已完成联邦事实信封、精确 Scope 授权、候选绑定、审计恢复、事务投递、来源版本确定性、对账排序和审计脱敏；Docker PostgreSQL 上的同步与精确 Scope 对账已通过。
- **单机 Docker Compose 部署：** ADR-0011 已完成 Web 与权威 PostgreSQL 的独立 Compose 部署、健康检查、重启持久化和设计事实回读。
- **系统概览首页与 MCP 同步：** ADR-0013 及其匹配的 Proposal、Context Pack、Evidence 和有类型关系已完成；首页保持 Scope 安全，不聚合跨应用服务事实。
- **单一权威本地 PostgreSQL：** ADR-0014 对本地权威库完成迁移和回读，图数据库继续作为可重建派生投影。

### 已完成的知识与 3A 增量

- **Agent 驱动的存量 Baseline 发现第一阶段：** ADR-0015 已完成签名扫描、源码最小化、断点恢复、双语语义评审、角色分离、原子提升、不可变 Baseline、稳定重扫 ID 和 Scope 隔离。
- **确定性 3A 投影第二阶段：** ADR-0019 已完成 BIZ、SYS、TECH 投影契约、精确 Scope MCP 派生、Baseline 漂移和固定 Context Pack。
- **持续观测治理核心与本地仓库连接器第三阶段：** ADR-0020 已完成持续观测接收边界、持久游标、哈希链批次收据、候选观察持久化、联邦 Outbox 和可恢复本地仓库连接器。
- **PostgreSQL-first 3A 导航工作台：** ADR-0022 已完成只读 3A 工作台、3a.v2 投影、Projector、查询、Principal 边界、双语视图、Docker 配置和权威 Docker PostgreSQL 验收。Designer Scope 已回填 194 条断言并发布 471 节点、277 条边的投影。

### 已完成的图能力增量

- **PostgreSQL 图遍历与事务 Outbox 回归：** ADR-0005 和 ADR-0006 的 PostgreSQL 遍历、确定性排序和事务 Outbox 契约已完成聚焦回归验证。
- **历史图 Outbox 归档：** `legacy-enterprise` 的 330 条非终态记录已按 Scope 安全归档，未删除 payload、事件或诊断；重新投影必须采用独立批准的同 Scope 重放策略。
- **本地单节点 NebulaGraph 兼容投影：** ADR-0012 的本地兼容拓扑、Outbox 投影、检查点、遍历、重启、幂等重放和 MCP 回读已完成；企业多节点、Kubernetes、密钥管理和亿级认证仍是活动待办。

### 已解决事件

- **权威 PostgreSQL 隧道中断：** `localhost:15433` 的临时不可达问题已恢复。后续治理会话已收敛，设计事实检查和精确 Scope 联邦对账均通过；有界重试与运维诊断加固仍保留在活动待办中。
