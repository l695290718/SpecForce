# SpecForge Backlog

## Design-Fact Governance

### Enforce SpecForge attestations in CodeArts/CodeHub

**Status:** Deferred by product decision; local Git Hook is the first increment.

**Owner:** SpecForge Enterprise Integration and Repository Governance.

**Rationale:** A local `pre-commit` gate improves normal developer and Agent behavior but Git permits `--no-verify` and Hooks are not installed automatically by clone. Repository-authoritative enforcement therefore requires CodeArts/CodeHub to independently recompute the committed tree, validate the SpecForge Change Attestation with a CI service identity, and make the result mandatory for protected-branch merge.

**Trigger:** Start only after the standalone Go Hook CLI, remote MCP attestation contract, strict `CONVERGED` policy, signing-key lifecycle, and local developer workflow are implemented and reviewed.

**Completion evidence:** A CodeHub merge request without a proof, with a bypassed Hook, stale tree, wrong repository or Scope, expired/revoked signature, incomplete multi-Scope coverage, or non-converged design must be rejected by a required protected-branch status check.

**中文本地化：**

**状态：** 根据产品决策延期，第一增量先实现本地 Git Hook。

**负责人：** SpecForge 企业集成与仓库治理。

**理由：** 本地 `pre-commit` 门禁可以约束普通开发者和 Agent 行为，但 Git 允许 `--no-verify`，且 clone 不会自动安装 Hook。要形成仓库权威控制，CodeArts/CodeHub 必须使用 CI 服务身份重新计算提交 tree、独立验证 SpecForge Change Attestation，并把结果设为受保护分支合入必选状态。

**启动条件：** Go 单文件 Hook CLI、远程 MCP 证明契约、严格 `CONVERGED` 策略、签名密钥生命周期和本地开发流程完成实现与评审后再启动。

**完成证据：** 缺少证明、绕过 Hook、tree 过期、仓库或 Scope 错误、签名过期或撤销、多 Scope 覆盖不完整以及设计未收敛的 CodeHub 合并请求，都必须被受保护分支必选状态拒绝。

### Implement unified 3A knowledge initialization

**Status:** Phase 3 scanner foundation and MockAI semantic candidate generation implemented and MCP synchronized; signed packaging, identity matching, 3A projections, and later increments pending. Web standalone artifact verification is blocked by the current Windows symlink policy.

**Owner:** SpecForge Architecture and Agent Integration.

**Rationale:** Existing enterprise application services need a low-friction baseline path that reuses Claude Code, OpenCode, and compatible coding Agents. ADR-0015 defines the local-Agent discovery boundary. ADR-0018 extends it with a generic 3A ontology, multiple evidence-backed assertions per semantic identity, configurable organization and analysis profiles, atomic ChangeSets, immutable Baselines, and derived Knowledge Layers.

**Delivery increments:** Generic foundation; initialization governance; generic scanning; 3A projections; and Huawei-profile migration plus hardening. The first usable path includes remote authenticated MCP control, a provider-neutral Agent integration, an ephemeral scanner contract, deterministic evidence indexing, semantic candidate submission, T0-T3 ReviewBundles, and manual Baseline publication for one exact application service.

**Deferred:** Continuous inbound synchronization, live database/API-gateway/CMDB/runtime connectors, outbound proposals, external `APPLY`, automatic cross-Scope merging, production object storage, and complete billion-scale capacity certification.

**Trigger:** Begin implementation only after `docs/superpowers/specs/2026-08-01-unified-3a-knowledge-initialization-design.md` is reviewed and its implementation plan is approved.

**Completion evidence:** The core must run without the Huawei profile; a non-DDD fixture must initialize through the Generic System profile; repeated scans must be idempotent; conflicting assertions must remain visible; partial scan, blocked review, and failed reconciliation must not activate a Baseline; and exact-Scope MCP persistence, reproducible deterministic KL context, pinned Context Pack retrieval, PostgreSQL authority, and graph-outage behavior must pass.

**Phase 3 evidence:** Core contracts, Profile-neutral Scope registry, assertion validation, content digests, PostgreSQL models and migration, scoped MCP operations, ReviewBundles, fail-closed coverage, MCP-only promotion decisions, ChangeSet promotion gates, deterministic local scanning, source-minimized observations, idempotent scan-report persistence, provider-neutral MockAI semantic candidate generation, bilingual candidate summaries, and atomic ReviewBundle assembly are implemented. `pnpm typecheck` passed all three packages; the core suite passed 145 tests; the scoped MCP tool suite passed 20 tests; the gated PostgreSQL scanner integration test passed report persistence, idempotency, candidate-only assertions, semantic generation, and ReviewBundle idempotency; and the CLI smoke scan produced 56 manifest entries, 56 structural observations, and a deterministic digest. `pnpm build` compiled and generated static pages but failed at Windows pnpm standalone symlink tracing; retry after enabling Developer Mode or using a symlink-capable build environment.

**Design-fact evidence:** `$env:SPECFORGE_DESIGN_FACT_IDS='adr-unified-3a-knowledge-initialization'; pnpm design-facts:sync` completed ADR-0018 and its generated Proposal, Context Pack, Evidence, and typed links. The matching exact-Scope check returned empty `missing`, `mismatched`, `outOfScope`, and `blocked` lists. A later full-batch synchronization timed out and remains a tooling follow-up.

**中文本地化：**

**状态：** 通用基础、初始化治理、扫描器基础和 MockAI 语义候选生成 Phase 3 已实现并完成 MCP 同步；签名包、身份匹配、3A 投影和后续增量待实现；Web standalone 产物验证受当前 Windows 符号链接策略阻塞。

**负责人：** SpecForge 架构与 Agent 集成。

**理由：** 企业存量应用需要复用 Claude Code、OpenCode 等现有 Coding Agent 的低门槛基线方案。ADR-0015 定义本地 Agent 发现边界；ADR-0018 进一步定义通用 3A 本体、同一语义身份的多证据断言、可配置组织与分析 Profile、原子 ChangeSet、不可变 Baseline 和派生知识层。

**交付增量：** 通用基础、初始化治理、通用扫描、3A 投影，以及华为 Profile 迁移与加固。首个可用路径包括远程鉴权 MCP、Provider 无关 Agent 集成、临时扫描工具契约、确定性证据索引、语义候选、T0-T3 ReviewBundle 和单个精确应用服务的手动 Baseline 发布。

**延期范围：** 持续入站同步、实时数据库/API 网关/CMDB/运行时连接器、出站 Proposal、外部 `APPLY`、自动跨 Scope 合并、生产对象存储和完整亿级容量认证。

**启动条件：** 用户评审 `docs/superpowers/specs/2026-08-01-unified-3a-knowledge-initialization-design.md` 并批准实施计划后开始开发。

**完成证据：** 核心必须可以脱离华为 Profile 运行；非 DDD Fixture 必须能通过 Generic System Profile 初始化；重复扫描幂等；冲突断言保持可见；部分扫描、阻塞审核和对账失败不能激活 Baseline；精确 Scope MCP 持久化、确定性 KL 上下文重现、固定 Context Pack 读取、PostgreSQL 权威和图故障回退都必须通过。

**Phase 3 证据：** 已实现核心契约、Profile 无关 Scope 注册表、断言校验、内容摘要、PostgreSQL 模型与迁移、精确 Scope MCP 操作、ReviewBundle、覆盖不足 fail-closed、MCP-only 提升决策、ChangeSet 提升门禁、确定性本地扫描、最小化源码结构观察、幂等扫描报告持久化、Provider 无关的 MockAI 语义候选生成、双语候选摘要和原子 ReviewBundle 组装。`pnpm typecheck` 三个包均通过；核心测试 145 项、范围化 MCP 工具测试 20 项通过；带门控的 PostgreSQL 扫描集成测试通过报告持久化、幂等、候选状态、语义生成和 ReviewBundle 幂等；CLI 烟测生成 56 个清单条目、56 个结构观察和确定性摘要。`pnpm build` 已完成编译和静态页面生成，但在 Windows pnpm standalone 符号链接追踪时失败；启用 Developer Mode 或使用支持符号链接的构建环境后重试。

**设计事实证据：** `$env:SPECFORGE_DESIGN_FACT_IDS='adr-unified-3a-knowledge-initialization'; pnpm design-facts:sync` 已完成 ADR-0018 及其 Proposal、Context Pack、Evidence 和类型化关系；精确 Scope 回读的 `missing`、`mismatched`、`outOfScope` 和 `blocked` 均为空。后续整批同步曾超时，保留为工具链待办。

### Synchronize architecture overview design facts

**Status:** Complete (MCP synchronized and read back on 2026-07-29).

**Owner:** SpecForge Architecture.

**Completion evidence:** After regenerating Prisma Client and using the authority-only local tunnel to Docker PostgreSQL, `pnpm design-facts:sync` wrote the ADR, Proposal, Context Pack, Evidence, and typed links. `pnpm design-facts:check` verified all ten decisions in the exact Designer Scope with no missing, mismatched, out-of-scope, or blocked facts. The focused MCP persistence, tools, and manifest suites passed 54 tests.

**中文本地化：** 已完成（2026-07-29 完成 MCP 同步与回读）。重新生成 Prisma Client 并通过仅本机可访问的权威 PostgreSQL 隧道后，`pnpm design-facts:sync` 已写入 ADR、Proposal、Context Pack、Evidence 和有类型关系；`pnpm design-facts:check` 在精确 Designer Scope 下验证全部 10 项决策，无缺失、不匹配、越界或受阻事实。MCP 持久化、工具和清单定向测试共 54 项通过。

### Complete dual-record synchronization

**Status:** Complete (locally verified on 2026-07-17).

The baseline ADR records, matching Proposals, Context Packs, typed ADR-to-asset links, and independent Evidence assets are synchronized through MCP. The reconciliation report verifies all of these records in the exact owning application-service scope and fails closed on any mismatch.

**Completion evidence:** On 2026-07-17, `pnpm design-facts:sync` persisted all seven baseline decisions and their Evidence/`VALIDATES` links; `pnpm design-facts:check` reported seven verified decisions with no missing, mismatched, out-of-scope, or blocked records.

### Reconcile historical ADR status text

**Status:** Complete (locally verified on 2026-07-19).

ADR-0001 through ADR-0006 now contain bilingual reconciliation updates that supersede historical MCP synchronization deferrals while preserving their real production-runtime and product-capability deferrals.

**Completion evidence:** `pnpm design-facts:sync` persists the updated bilingual ADR content and `pnpm design-facts:check` reports all seven baseline decisions verified without missing, mismatched, out-of-scope, or blocked facts.

### Persist federated governance-core design fact

**Status:** Complete (MCP synchronized and read back on 2026-07-23).

**Owner:** SpecForge Architecture.

**Rationale:** ADR `adr-federated-design-fact-synchronization`, its Proposal, Context Pack, `IMPLEMENTS_DECISION`, `IMPLEMENTS_CONTEXT_FOR`, `DECIDES`, and `VALIDATES` links, and six manifest-declared Evidence assets are persisted through MCP and read back in the exact Designer Scope.

**Completion evidence:** The Docker PostgreSQL authority at `localhost:5433/specforge` is reachable. `pnpm design-facts:sync` and `pnpm design-facts:check` verified all eight baseline decisions with no missing, mismatched, out-of-scope, or blocked records. The configured-scope federation check returned `blocking: false` with no issue counts.

**中文本地化：** 状态为已完成并已在 2026-07-23 完成 MCP 同步与回读。Docker PostgreSQL 权威库 `localhost:5433/specforge` 可访问；`pnpm design-facts:sync` 和 `pnpm design-facts:check` 已核验全部 8 项基线决策，没有缺失、不匹配、越界或受阻记录。精确 Scope 的联邦检查返回 `blocking: false`，没有问题计数。

**Future trigger:** After a design-fact change, re-run `pnpm design-facts:sync`, `pnpm design-facts:check`, and `SPECFORGE_APPLICATION_SERVICE_ID=com.huawei.celon.desiner SPECFORGE_SCOPE_PATH=pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner pnpm design-facts:federation:check` before completion.

### Complete federation integration hardening slices two and three

**Status:** Complete (MCP synchronized and read back on 2026-07-23).

**Owner:** SpecForge Architecture.

**Rationale:** Slices 2A through 3B locally implement the federated authorization, candidate-binding, audit recovery, transactional delivery, connector readiness, source-version determinism, reconciliation ordering, and audit redaction contracts. The audit failure contract is `FEDERATION_TOOL_ERROR;diagnosticRef=<64-hex SHA-256 digest>`; raw exception and credential text must never be persisted in `AuditLog.errorMessage`.

**中文本地化：** 第 2A 至 3B 轮次已实现联邦授权、候选绑定、审计恢复、事务投递、连接器就绪性、来源版本确定性、对账排序和审计脱敏契约，并在 2026-07-23 完成 MCP 同步与回读。审计失败契约为 `FEDERATION_TOOL_ERROR;diagnosticRef=<64 位十六进制 SHA-256 摘要>`；原始异常和凭据文本不得持久化到 `AuditLog.errorMessage`。

**Completion evidence:** The matching MCP assets, sixth Evidence record, and `VALIDATES` links were synchronized and read back through `localhost:5433/specforge`; the eight-decision design-fact reconciliation and exact-scope federation check passed.

**Future trigger:** After a federated design-fact change, run `pnpm design-facts:sync`, `pnpm design-facts:check`, and `SPECFORGE_APPLICATION_SERVICE_ID=com.huawei.celon.desiner SPECFORGE_SCOPE_PATH=pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner pnpm design-facts:federation:check`, then read back the ADR, sixth Evidence/`VALIDATES` link, localized fields, and audit-security contract.

### Single-host Docker Compose deployment

**Status:** Complete (locally verified on 2026-07-24).

The Web console and authoritative PostgreSQL database are packaged as separate Docker Compose services. PostgreSQL remains private to the Compose network, uses the `specforge_pgdata` named volume, and the Web image supports later replacement with an external `DATABASE_URL`. MCP remains a client-side stdio process.

**Completion evidence:** `powershell -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1 -ConfigurationOnly` passed; `docker compose --env-file deploy/.env.example -f deploy/compose.yaml build web` built the production image; and `powershell -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1 -Live` passed health and Web-restart persistence verification on an isolated port-3010 stack. `pnpm design-facts:check` read back all nine baseline decisions without missing, mismatched, out-of-scope, or blocked records.

**中文本地化：** 单机 Docker Compose 部署已在 2026-07-24 完成本地验证。Web 控制台和权威 PostgreSQL 是独立服务；PostgreSQL 仅在 Compose 网络内可见，使用命名卷 `specforge_pgdata`，Web 镜像可通过外部 `DATABASE_URL` 切换到企业 PostgreSQL。MCP 仍由 Agent 通过 stdio 启动。配置检查、生产镜像构建、端口 3010 隔离栈的健康检查及 Web 重启持久性验证均已通过；设计事实回读核验了全部 9 个 ADR。


## Enterprise Impact Analysis

### Reconfigure graph verification for the canonical PostgreSQL authority

**Status:** Complete for the canonical runtime; legacy graph-stack retirement in progress.

**Owner:** SpecForge Architecture.

**Rationale:** The complete authored catalog was restored into `deploy-postgres/specforge_canonical` and local Web/MCP now use that single authority. The legacy `specforge-graph-verify-postgres` container remains preserved as a rollback source because the graph verification Compose stack still depends on its isolated PostgreSQL service.

**Completion evidence (2026-07-30):** The `specforge-canonical-graph` Projector connects only to `deploy-postgres-1/specforge_canonical` through the external `deploy_default` network. Gateway and Projector are healthy; MCP synchronization and exact-Designer-scope reconciliation complete with no missing, mismatched, out-of-scope, or blocked facts.

**Legacy retirement:** Back up and stop `specforge-graph-verify-*` without removing its Docker volumes. It is no longer an active authoring or projection authority.

**Completion evidence:** The graph verifier uses the canonical PostgreSQL connection, projection checkpoints and an impact query pass, no active application process reads `specforge-graph-verify-postgres`, and the scoped MCP reconciliation remains clean.

### Resolve legacy graph-outbox migration state

**Status:** Complete (scope-safe archival on 2026-07-30).

**Owner:** SpecForge Runtime.

**Rationale:** `legacy-enterprise` historical outbox records were preserved but cannot be treated as current Designer-scope evidence. The scoped operation archived 330 nonterminal rows without deleting payloads, events, or diagnostics and wrote AuditLog `archive_legacy_graph_outbox` with a completed receipt.

**Completion evidence:** `DATABASE_URL=<canonical> pnpm graph-outbox:archive` reported 330 eligible rows; `pnpm graph-outbox:archive --apply` changed only `legacy-enterprise` PENDING, DELIVERING, and DEAD_LETTER rows to `ARCHIVED`. The post-check reported `legacy-enterprise|ARCHIVED|330`, `legacy-enterprise|COMPLETED|408`, and a completed `AuditLog` entry. A future re-projection requires a separately approved, same-scope replay policy.

### NebulaGraph production projection

**Status:** Runtime components live and healthy; authoritative outbox projection and MCP closure blocked.

**Owner:** SpecForge Runtime for live projection and Projector health; SpecForge Architecture for MCP synchronization.

The repository now contains the typed Go Gateway and official NebulaGraph adapter, leased/idempotent PostgreSQL outbox Projector, Gateway-backed GraphStore, explicit `nebula`/`postgres` runtime selection, single-node Compose configuration, operations guide, and cross-adapter/sibling-scope tests. PostgreSQL remains authoritative and NebulaGraph remains a derived projection.

**Verified repository evidence (2026-07-27):**

- commits `3991632`, `836762a`, `e686ebb`, `cf3ecb7`, `8be48c8`, and `e51de0f` were inspected;
- focused Vitest verification passed 5 files and 33 tests;
- GraphStore, Graph Projector, and impact-worker TypeScript typechecks passed;
- Gateway `go test ./...` passed with the live compatibility case skipped because `SPECFORGE_NEBULA_COMPATIBILITY=1` was not set; and
- `powershell -ExecutionPolicy Bypass -File deploy/graph/verify-projection.ps1 -ConfigurationOnly` passed the local/external Compose topology assertions.

**Verified live state (2026-07-28):** the private Compose profile reports PostgreSQL, Nebula Meta, Storage, Graphd, Gateway, and Projector healthy. The Gateway uses the official v3 Nebula client, initializes the schema before health checks, projects stable bounded vertex IDs, and returns complete typed edges. The Projector exposes exact-scope health with backlog, checkpoint, retry, and dead-letter fields.

**Remaining completion gates:**

- make the elected PostgreSQL authority available to the scoped MCP client, author one exact-Designer-scope relationship, and prove its `RelationshipOutbox` row drains to NebulaGraph;
- retain exact-scope checkpoint advancement, multi-hop traversal, Projector restart, and duplicate-edge evidence; and
- persist and read back the matching ADR, Proposal, Context Pack, design assets, typed links, and Evidence through MCP in the exact Designer scope.

**Authoritative outbox blocked:** a read-only query against the live graph-profile PostgreSQL returned zero `RelationshipOutbox` and zero `ProjectionCheckpoint` rows. Retry trigger: create the exact-scope relationship through MCP after the elected authority is reachable, then repeat the live procedure in `docs/operations/nebulagraph-projection.md`.

**MCP synchronization blocked:** the elected Docker PostgreSQL authority at `localhost:5433/specforge` is unreachable from the MCP stdio client. The graph-profile database remains private by design and `localhost:5432` was deliberately not substituted. Retry trigger: restore `5433` or run an approved scoped MCP client on the private Compose network, then run `pnpm design-facts:sync`, `pnpm design-facts:check`, and the exact-scope federation check with scoped read-back.

**中文本地化：**

**状态：** 仓库实现和非在线检查已完成；生产闭环仍受阻。

仓库已经包含有类型的 Go Gateway 与 NebulaGraph 官方客户端适配器、带租约和幂等语义的 PostgreSQL Outbox Projector、Gateway GraphStore、显式 `nebula`/`postgres` 运行时选择、单节点 Compose 配置、运维指南，以及跨适配器和兄弟 Scope 隔离测试。PostgreSQL 始终保持权威，NebulaGraph 只作为派生投影。

2026-07-27 的仓库证据包括：检查六个实现提交；聚焦 Vitest 通过 5 个文件和 33 个测试；三个相关 TypeScript 类型检查通过；Gateway `go test ./...` 通过但真实 Nebula 兼容测试因未启用而跳过；Compose 配置断言通过。

剩余门禁包括：在真实 NebulaGraph 3.8.0 上运行官方客户端兼容测试；验证 Outbox 到 Nebula 的端到端投影、幂等写入、精确 Scope 检查点、多跳遍历和重启去重；交付 Projector 运维健康端点；并在精确 Designer Scope 通过 MCP 写入和回读 ADR、Proposal、Context Pack、设计资产、类型关系与 Evidence。本次仅仓库任务禁止调用 MCP，因此必须保持 **MCP synchronization blocked**，不得声明整体完成。

**2026-07-28 更新：** 本地私有 Compose 图运行时中的 PostgreSQL、Nebula Meta、Storage、Graphd、Gateway 和 Projector 均已健康。Gateway 已使用官方 v3 客户端，并完成 schema 初始化、稳定短顶点 ID 和完整边映射；Projector 已提供精确 Scope 的 backlog、checkpoint、retry 与 dead-letter 健康字段。

当前不能关闭本待办：对图运行时私有 PostgreSQL 的只读查询返回零条 `RelationshipOutbox` 和零条 `ProjectionCheckpoint`，因此尚无 MCP 编写关系经 Outbox 到 NebulaGraph 的证据。已选定的权威库 `localhost:5433/specforge` 对主机 MCP stdio 客户端不可达；虽然 `localhost:5432` 可响应，但它不是已选权威库，未被替代使用。重试条件：恢复 `5433`，或在私有 Compose 网络中运行获准的 Scope MCP 客户端；随后创建一条精确 Designer Scope 关系，并完成 Outbox、checkpoint、遍历、Projector 重启和 MCP 回读验证。

### PostgreSQL graph traversal final regression

**Status:** Complete (locally verified on 2026-07-19).

The complete PostgreSQL-backed GraphStore suite was run after the final deterministic root-ordering change against the local `specforge` PostgreSQL database.

**Completion evidence:** `DATABASE_URL=postgresql://admin:admin@localhost:5433/specforge?schema=public SPECFORGE_PG_INTEGRATION=1 pnpm --filter @specforge/graph-store test -- postgres.integration.test.ts` passed 3 test files and 51 tests, including the disposable PostgreSQL integration suite.

## Deferred product capability

### Architecture overview home page

**Status:** Complete (superseded backlog record).

**Superseded:** This historical entry is retained only for traceability. The authoritative completion record is `Synchronize architecture overview design facts`, which was MCP synchronized and read back on 2026-07-29. The implementation is now on `main`.

**中文说明：** 此历史条目仅保留用于追溯，已被“Synchronize architecture overview design facts”完成记录取代；该记录已于 2026-07-29 通过 MCP 同步并回读，首页实现已合并至 `main`。

Create a bilingual home page that explains SpecForge's system positioning, MCP-first authoring boundary, authoritative PostgreSQL and derived graph-projection architecture, and the typed relationships among design assets. The page must help a new user understand how Proposals, ADRs, Context Packs, APIs, data models, rules, events, state machines, and evidence connect without becoming a global cross-service data view.

**Owner:** SpecForge Product and Architecture.

**Rationale:** The current console opens directly into scoped workspaces and design assets. It does not yet provide a concise architectural orientation or a relationship-led entry point for new users.

**Trigger:** Start after the NebulaGraph production-projection runtime is operationally verified and the product team approves the information architecture for a scoped, bilingual landing experience.

**Completion evidence:** A bilingual, scope-safe home page is implemented with a verified relationship visualization sourced from scoped design assets; its Proposal, Context Pack, design assets, typed links, and Evidence are persisted and read back through MCP.

**中文本地化：**

**状态：** 延期。

新增双语首页，说明 SpecForge 的系统定位、MCP-first 编写边界、PostgreSQL 权威存储与派生图投影架构，以及设计资产之间的有类型关系。首页应帮助新用户理解 Proposal、ADR、Context Pack、API、数据模型、规则、事件、状态机和 Evidence 如何关联，同时不得形成跨应用服务的全局数据视图。

**负责人：** SpecForge 产品与架构团队。

**触发条件：** NebulaGraph 生产投影运行时完成运维验证，并且产品团队确认面向精确 Scope 的双语首页信息架构后启动。

### Authorized multi-service comparison

**Status:** Deferred.

Agents with explicit grants may eventually compare or aggregate multiple application services. This view must permission-filter every participating application service before it reads, joins, or presents any design asset or derived analysis.

### Production identity and authorization

**Status:** Deferred.

Replace the MVP mock actor grants with production identity, tenant policy, OAuth/RBAC enforcement, and auditable cross-service authorization decisions. This must preserve the existing fail-closed application-service scope boundary.

**Completion evidence:** authenticated MCP and Web requests enforce tenant and application-service grants in integration tests, including denied cross-service reads and writes.
