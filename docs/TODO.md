# SpecForge Backlog

## Design-Fact Governance

### Enforce SpecForge attestations in CodeArts/CodeHub

**Status:** Provider-neutral CI verification contract implemented locally; CodeArts/CodeHub protected-branch enforcement remains deferred.

**Owner:** SpecForge Enterprise Integration and Repository Governance.

**Rationale:** A local `pre-commit` gate improves normal developer and Agent behavior but Git permits `--no-verify` and Hooks are not installed automatically by clone. Repository-authoritative enforcement therefore requires CodeArts/CodeHub to independently recompute the committed tree, validate the SpecForge Change Attestation with a CI service identity, and make the result mandatory for protected-branch merge.

**Trigger:** Start the platform-specific adapter only after the standalone Go Hook CLI, provider-neutral remote MCP verification contract, strict `CONVERGED` policy, signing-key lifecycle, and local developer workflow are reviewed for the target CodeHub deployment.

**Completion evidence:** A CodeHub merge request without a proof, with a bypassed Hook, stale tree, wrong repository or Scope, expired/revoked signature, incomplete multi-Scope coverage, or non-converged design must be rejected by a required protected-branch status check.

**Local contract evidence (2026-08-09):** `verify_change_attestation` now validates signed repository evidence, exact multi-Scope coverage, session/reconciliation convergence, expiry, signature, trusted/revoked key policy, and deterministic failure codes. This does not register a CodeHub status check or block an external merge.

**中文对齐（2026-08-09）：** 与平台无关的 CI 变更证明校验契约已在本地完成，能够校验签名仓库证据、精确多 Scope 覆盖、会话与对账收敛、有效期、密钥信任/撤销状态及确定性失败码。CodeHub 状态检查注册和外部合入阻断仍为待办。

**中文本地化：**

**状态：** 根据产品决策延期，第一增量先实现本地 Git Hook。

**负责人：** SpecForge 企业集成与仓库治理。

**理由：** 本地 `pre-commit` 门禁可以约束普通开发者和 Agent 行为，但 Git 允许 `--no-verify`，且 clone 不会自动安装 Hook。要形成仓库权威控制，CodeArts/CodeHub 必须使用 CI 服务身份重新计算提交 tree、独立验证 SpecForge Change Attestation，并把结果设为受保护分支合入必选状态。

**启动条件：** Go 单文件 Hook CLI、远程 MCP 证明契约、严格 `CONVERGED` 策略、签名密钥生命周期和本地开发流程完成实现与评审后再启动。

**完成证据：** 缺少证明、绕过 Hook、tree 过期、仓库或 Scope 错误、签名过期或撤销、多 Scope 覆盖不完整以及设计未收敛的 CodeHub 合并请求，都必须被受保护分支必选状态拒绝。

### Implement unified 3A knowledge initialization

**Status:** Phase 1 Baseline discovery runtime, Phase 2 deterministic 3A projections, and the Phase 3 continuous-observation governance core plus provider-neutral local-repository connector are implemented, locally verified, MCP synchronized, and read back. External live adapters and Phases 4-5 remain pending.

**Owner:** SpecForge Architecture and Agent Integration.

**Rationale:** Existing enterprise application services need a low-friction baseline path that reuses Claude Code, OpenCode, and compatible coding Agents. ADR-0015 defines the local-Agent discovery boundary. ADR-0018 extends it with a generic 3A ontology, multiple evidence-backed assertions per semantic identity, configurable organization and analysis profiles, atomic ChangeSets, immutable Baselines, and derived Knowledge Layers.

**Delivery increments:** Phase 1 delivers signed native scanning, resumable MCP ingestion, semantic review, atomic promotion, reconciliation, and immutable Baseline publication. Phase 2 delivers deterministic 3A projections. Phase 3 now delivers the provider-neutral continuous-observation receiving boundary, durable PostgreSQL cursors, hash-chained batch receipts, exact-Scope MCP authorization, idempotent candidate observation persistence, a local repository source adapter, and a resumable connector runtime; concrete external adapters remain a follow-up. Phase 4 adds CodeHub/CI enforcement. Phase 5 covers enterprise profile migration, object storage, graph projection, and billion-scale certification.

**Deferred:** Concrete live database/API-gateway/CMDB/runtime adapters, polling/webhook workers, automatic candidate promotion, outbound proposals, external `APPLY`, automatic cross-Scope merging, production object storage, and complete billion-scale capacity certification.

**Next trigger:** Start a concrete live connector, CodeHub enforcement, or Phase 5 scale increment only after its dedicated ADR, implementation plan, exact-Scope preflight, and acceptance evidence are approved.

**Phase 2 implementation record:** `docs/adr/0019-deterministic-3a-knowledge-projections.md` and `docs/superpowers/plans/2026-08-03-deterministic-3a-projections.md`. The core projection contract and exact-Scope MCP derive operation now provide BIZ/SYS/TECH layers, explicit cross-layer alignment, Baseline drift, and a pinned Context Pack. Focused verification and MCP read-back passed; later connector, graph, CodeHub, and capacity phases remain pending.

**Phase 3 implementation record:** `docs/adr/0020-continuous-observation-governance.md` and `docs/superpowers/plans/2026-08-03-continuous-observation-governance.md`. The exact-Scope MCP receiving boundary now validates bounded hash-chained batches, persists durable PostgreSQL cursors and batch receipts, stores accepted observations as candidates, and emits the transactional federation outbox event. The local repository connector reuses the Phase 1 scanner/extractor and emits MCP-ready pages with deterministic snapshot cursors. Concrete database/API/CMDB/runtime adapters, live polling/webhooks, promotion automation, and external `APPLY` remain pending.

**Phase 3 evidence:** `pnpm db:push` synchronized the cursor and batch schema to Docker PostgreSQL at `localhost:15433`; the focused core/MCP suites passed 41 tests; the gated real PostgreSQL transaction suite passed first acceptance, identical retry, cursor read-back, sequence-gap rejection, and cleanup; the Web service returned HTTP 200.

**Completion evidence:** Phase 1 requires signed-release verification, safe source-minimized extraction, exact checkpoint resume, bilingual semantic review, actor separation, atomic promotion, durable reconciliation, immutable Baseline publication, stable rescan IDs, sibling-Scope isolation, exact-Scope MCP synchronization, and read-back. Phase 2 retains the additional projection and pinned-context acceptance criteria.

**Phase 1 evidence:** `pnpm legacy-baseline:verify` exited `0`; `artifacts/legacy-baseline-verification.json` records all ten checks as `PASSED`, including contract drift, Go tests/build, 155 Core tests, MCP scanner/knowledge tests, PostgreSQL integration, real signed-binary E2E, 100,000-observation scale, typecheck, and production build. The local Windows build used `SPECFORGE_NEXT_STANDALONE=0` to avoid OneDrive/pnpm symlink creation; Docker/Linux keeps standalone output enabled.

**Design-fact evidence:** The latest full MCP synchronization and read-back verified all 19 decisions with empty missing, mismatched, out-of-scope, and blocked lists; exact-Scope federation reconciliation returned `blocking:false` and no issues. Phase 1-3 ADRs, Proposals, Context Packs, managed facts, Evidence, and directional typed links are present in the canonical authority.

**Design-fact synchronization retry hardening:** Deferred after a transient `MCP synchronization blocked` event when the Docker PostgreSQL tunnel at `localhost:15433` was temporarily unreachable. **Owner:** SpecForge Architecture. **Retry trigger:** reproduce or observe a tunnel outage, then add bounded retry, reachability diagnostics, and an operator-visible failure receipt without changing the exact-Scope or PostgreSQL authority rules. **Rationale:** A transient tunnel interruption must be diagnosable and recoverable without weakening the MCP-only write boundary.

**Resolved incident receipt (2026-08-09):** The temporary `localhost:15433` outage was recovered by starting the canonical Docker PostgreSQL authority and tunnel. The parallel governance preflight and both exact-Scope follow-up sessions subsequently closed `CONVERGED`; `pnpm design-facts:check` verified all 19 decisions with empty issue lists, and exact-Scope federation reconciliation returned `blocking:false`. The bounded-retry and operator-diagnostic hardening item above remains deferred as resilience work, not as an active synchronization blocker.

**已解决事件回执（2026-08-09）：** 启动权威 Docker PostgreSQL 和本地隧道后，`localhost:15433` 临时不可达问题已经恢复。并行治理预检及两个精确 Scope 后续会话均已关闭为 `CONVERGED`；`pnpm design-facts:check` 已核验全部 19 项决策且问题列表为空，精确 Scope 联邦对账返回 `blocking:false`。上方有界重试和运维诊断加固仍作为韧性待办保留，不再视为当前同步阻塞。

**中文本地化：**

**状态：** 第一阶段 Baseline 发现、第二阶段确定性 3A 投影和第三阶段持续观测治理核心均已实现并完成 MCP 同步和回读。具体实时连接器、CodeHub 门禁和第五阶段规模化能力保持待办。

**负责人：** SpecForge 架构与 Agent 集成。

**理由：** 企业存量应用需要复用 Claude Code、OpenCode 等现有 Coding Agent 的低门槛基线方案。ADR-0015 定义本地 Agent 发现边界；ADR-0018 进一步定义通用 3A 本体、同一语义身份的多证据断言、可配置组织与分析 Profile、原子 ChangeSet、不可变 Baseline 和派生知识层。

**交付增量：** 第一阶段交付签名原生扫描、可恢复 MCP 摄取、语义评审、原子提升、对账和不可变 Baseline 发布。第二阶段交付确定性 3A 投影。第三阶段已交付持续观测接收边界、持久游标、哈希链批次收据和候选观察持久化，具体实时连接器仍待后续交付。第四阶段增加 CodeHub/CI 门禁。第五阶段完成企业 Profile 迁移、对象存储、图投影和亿级认证。

**延期范围：** 持续入站同步、实时数据库/API 网关/CMDB/运行时连接器、出站 Proposal、外部 `APPLY`、自动跨 Scope 合并、生产对象存储和完整亿级容量认证。

**启动条件：** 第一阶段 MCP 记录和精确设计变更会话收敛后，再评审并批准独立的第二阶段设计与实施计划。

**完成证据：** 第一阶段要求签名发布校验、安全源码最小化提取、精确检查点恢复、双语语义评审、角色分离、原子提升、持久对账、不可变 Baseline 发布、重扫 ID 稳定、同级 Scope 隔离以及精确 Scope MCP 同步与回读。第二阶段继续保留投影和固定上下文验收标准。

**第一阶段证据：** `pnpm legacy-baseline:verify` 退出码为 `0`；`artifacts/legacy-baseline-verification.json` 对全部十项检查记录为 `PASSED`，包括契约漂移、Go 测试与构建、155 项 Core 测试、MCP 扫描器/知识测试、PostgreSQL 集成、真实签名二进制端到端、10 万条观察规模、类型检查和生产构建。本地 Windows 构建使用 `SPECFORGE_NEXT_STANDALONE=0` 规避 OneDrive/pnpm 符号链接创建限制；Docker/Linux 仍启用 standalone 输出。

**设计事实证据：** 最新完整 MCP 同步和回读已核验全部 19 项决策，缺失、不匹配、越界和阻塞列表均为空；精确 Scope 联邦对账返回 `blocking:false` 且无问题。第一至第三阶段 ADR、Proposal、Context Pack、托管事实、Evidence 和有向类型关系均已存在于规范权威库中。

**设计事实同步重试加固：** 因 Docker PostgreSQL 隧道 `localhost:15433` 暂时不可达而出现过一次 `MCP synchronization blocked`，现已通过重试恢复，后续延期加固。**负责人：** SpecForge Architecture。**重试触发条件：** 再次复现或观测隧道中断后，增加有界重试、可达性诊断和面向运维的失败收据，同时不得改变精确 Scope 或 PostgreSQL 权威规则。**理由：** 短暂隧道中断必须可诊断、可恢复，且不能弱化 MCP-only 写入边界。

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

**Status:** Runtime components live and healthy; authoritative outbox projection, checkpoint, traversal, restart/idempotency, and MCP read-back evidence are complete for the local single-node compatibility topology. Enterprise multi-node sizing and scale certification remain deferred.

**Owner:** SpecForge Runtime for live projection and Projector health; SpecForge Architecture for MCP synchronization.

The repository now contains the typed Go Gateway and official NebulaGraph adapter, leased/idempotent PostgreSQL outbox Projector, Gateway-backed GraphStore, explicit `nebula`/`postgres` runtime selection, single-node Compose configuration, operations guide, and cross-adapter/sibling-scope tests. PostgreSQL remains authoritative and NebulaGraph remains a derived projection.

**Verified repository evidence (2026-07-27):**

- commits `3991632`, `836762a`, `e686ebb`, `cf3ecb7`, `8be48c8`, and `e51de0f` were inspected;
- focused Vitest verification passed 5 files and 33 tests;
- GraphStore, Graph Projector, and impact-worker TypeScript typechecks passed;
- Gateway `go test ./...` passed with the live compatibility case skipped because `SPECFORGE_NEBULA_COMPATIBILITY=1` was not set; and
- `powershell -ExecutionPolicy Bypass -File deploy/graph/verify-projection.ps1 -ConfigurationOnly` passed the local/external Compose topology assertions.

**Verified live state (2026-08-09):** the private Compose profile reports PostgreSQL, Nebula Meta, Storage, Graphd, Gateway, and Projector healthy. The Gateway uses the official v3 Nebula client, initializes the schema before health checks, projects stable bounded vertex IDs, and returns complete typed edges. The Projector exposes exact-scope health with backlog, checkpoint, retry, and dead-letter fields.

**Completion evidence:** `powershell -ExecutionPolicy Bypass -File deploy/graph/verify-projection.ps1 -Live` passed the exact-Scope MCP fixture, `RelationshipOutbox` completion, checkpoint `13`, two-hop traversal with 3 nodes and 2 edges, Projector restart, idempotent replay with one logical edge and `eventCount=1`, and zero dead letters. The repaired checkpoint SQL explicitly writes the required non-null `updatedAt` field.

**MCP synchronization closed:** the canonical Docker PostgreSQL authority is reached through `localhost:15433/specforge_canonical`. The matching ADR, Proposal, Context Pack, design assets, typed links, and Evidence have been synchronized and read back in the exact Designer Scope.

**Deferred:** external Nebula clusters, multi-node production sizing, Kubernetes deployment, enterprise secret management, and billion-scale certification. These require independent production evidence and do not block the local compatibility increment.

**中文本地化：**

**状态：** 仓库实现和运行组件健康检查已完成；MCP 设计事实已同步并回读；权威 Outbox 端到端投影证据仍延期。

仓库已经包含有类型的 Go Gateway 与 NebulaGraph 官方客户端适配器、带租约和幂等语义的 PostgreSQL Outbox Projector、Gateway GraphStore、显式 `nebula`/`postgres` 运行时选择、单节点 Compose 配置、运维指南，以及跨适配器和兄弟 Scope 隔离测试。PostgreSQL 始终保持权威，NebulaGraph 只作为派生投影。

2026-07-27 的仓库证据包括：检查六个实现提交；聚焦 Vitest 通过 5 个文件和 33 个测试；三个相关 TypeScript 类型检查通过；Gateway `go test ./...` 通过但真实 Nebula 兼容测试因未启用而跳过；Compose 配置断言通过。

剩余门禁包括：验证 Outbox 到 Nebula 的端到端投影、幂等写入、精确 Scope 检查点、多跳遍历和重启去重，并保留完成后的精确 Scope MCP 回读。ADR、Proposal、Context Pack、设计资产、类型关系与 Evidence 已完成 MCP 同步；这不会替代仍缺失的投影运行证据。

**2026-07-28 更新：** 本地私有 Compose 图运行时中的 PostgreSQL、Nebula Meta、Storage、Graphd、Gateway 和 Projector 均已健康。Gateway 已使用官方 v3 客户端，并完成 schema 初始化、稳定短顶点 ID 和完整边映射；Projector 已提供精确 Scope 的 backlog、checkpoint、retry 与 dead-letter 健康字段。

当前不能关闭投影运行待办：对图运行时的只读查询返回零条 `RelationshipOutbox` 和零条 `ProjectionCheckpoint`，因此尚无 MCP 编写关系经 Outbox 到 NebulaGraph 的证据。重试条件：恢复图投影工作后，通过当前权威 PostgreSQL 在精确 Designer Scope 创建关系，并完成 Outbox、checkpoint、遍历、Projector 重启和 MCP 回读验证。

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

**Status:** Provider-neutral ScopedPrincipal foundation implemented locally; production identity provider and tenant administration remain deferred.

Agents with explicit grants may eventually compare or aggregate multiple application services. This view must permission-filter every participating application service before it reads, joins, or presents any design asset or derived analysis.

### Production identity and authorization

**Status:** Deferred.

Replace the MVP mock actor grants with production identity, tenant policy, OAuth/RBAC enforcement, and auditable cross-service authorization decisions. This must preserve the existing fail-closed application-service scope boundary.

**Local contract evidence (2026-08-09):** Core and MCP now normalize stable subject, tenant, auth source, permissions, and exact application-service grants through `ScopedPrincipal`; seed identity remains development-only. No enterprise IdP integration is claimed.

**Completion evidence:** authenticated MCP and Web requests enforce tenant and application-service grants in integration tests, including denied cross-service reads and writes.

### Knowledge-Assertion-aware Nebula 3A projection

**Status:** Deferred; not part of the PostgreSQL-first 3A browser increment.

**Owner:** SpecForge Runtime.

**Rationale:** The current NebulaGraph projection stores design-asset identities and current typed relationships. It is not semantically equivalent to Baseline-bound Knowledge Assertions, Profile-pinned projection generations, or historical relationship snapshots, so routing the 3A browser through it would return incorrect architecture history.

**Trigger:** Start only after the PostgreSQL 3A workspace passes acceptance and query telemetry demonstrates a traversal workload that needs graph acceleration. Open a separate ADR and exact-Scope Design Change Session before implementation.

**Required completion evidence:** Define Knowledge Assertion vertices, versioned relationship edges, Baseline membership or as-of semantics, outbox events, checkpoint namespace, rebuild and rollback behavior, PostgreSQL/Nebula result parity, multi-node sizing, and production-scale certification. Synchronize the matching ADR, Proposal, Context Pack, Evidence, backlog state, and typed links through MCP.

**中文本地化：**

**状态：** 延期，不属于 PostgreSQL-first 3A 浏览器增量。

**负责人：** SpecForge Runtime。

**原因：** 当前 NebulaGraph 投影保存设计资产身份和当前类型关系，与绑定 Baseline 的 Knowledge Assertion、固定 Profile 的投影代次以及历史关系快照并不等价，直接复用会返回错误的架构历史。

**触发条件：** PostgreSQL 3A 工作台验收通过，并且真实查询遥测证明需要图加速后才能启动。实现前必须创建独立 ADR 和精确 Scope 设计变更会话。

**完成证据：** 必须定义 Knowledge Assertion 顶点、版本化关系边、Baseline 成员或 as-of 语义、Outbox 事件、检查点命名空间、重建与回滚行为、PostgreSQL/Nebula 结果一致性、多节点容量和生产规模认证，并通过 MCP 同步匹配的 ADR、Proposal、Context Pack、Evidence、待办状态和类型关系。

## 3A Architecture Navigation Workspace

**Status:** Implemented, accepted against canonical Docker PostgreSQL, and synchronized through MCP on 2026-08-10.

**Owner:** SpecForge Architecture and Runtime.

**Scope:** `com.huawei.celon.desiner` (`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`).

**Delivery:** The PostgreSQL-first read-only `/architecture/3a` workspace, v2 projection contracts and read model, leased asynchronous Knowledge Projector, bounded shared query service, exact-Scope MCP operations, provider-neutral Web principal boundary, bilingual lane/list/detail/alignment/drift views, and Docker deployment wiring are implemented. The matching ADR, implemented Proposal, Context Pack, managed assets, Evidence, and typed links were synchronized and read back through MCP.

**Evidence:** Core, Query, Projector, MCP, and Web focused suites passed; all five package typechecks passed; the production build passed with `SPECFORGE_NEXT_STANDALONE=0`; Compose configuration passed. The canonical Docker PostgreSQL Projector e2e passed one test covering Baseline publication, lease restart recovery, bounded queries, cursor replay denial, tracing, alignment, drift, sibling-Scope denial, and cleanup. Browser Playwright acceptance passed at desktop `1280x720` and mobile `509x642`; the authorized Designer Scope rendered the bilingual workspace and the sibling PolicyHub Scope returned access denied. Normal Windows/OneDrive Prisma native-engine replacement and standalone symlink creation returned `EPERM`, so Docker/Linux is the production packaging path.

**中文本地化：**

**状态：** 2026-08-10 已实现、通过权威 Docker PostgreSQL 验收并完成 MCP 同步与回读。

**交付：** 已实现 PostgreSQL-first 的只读 `/architecture/3a` 工作台、3A v2 投影契约与读模型、带租约异步 Knowledge Projector、有界共享查询服务、精确 Scope MCP 操作、Provider-neutral Web Principal 边界、双语泳道/列表/详情/对齐/漂移视图和 Docker 部署配置。对应 ADR、已实现 Proposal、Context Pack、管理资产、Evidence 与有向类型关系均已通过 MCP 同步并回读。

### Gated 3A PostgreSQL integration and visual acceptance

**Status:** Complete on 2026-08-10 for the canonical Docker PostgreSQL and local Web acceptance gate. Production identity, cross-application-service comparison, and Knowledge-Assertion-aware Nebula projection remain separate deferred capabilities.

**Owner:** SpecForge Runtime and Release.

**Evidence:** `$env:SPECFORGE_3A_INTEGRATION='1'; $env:DATABASE_URL='postgresql://specforge:local-deployment-verification-only@localhost:15433/specforge_canonical?schema=public'; vitest run src/projection.e2e.test.ts` passed one test. In-app browser Playwright rendered `/architecture/3a?scope=com.huawei.celon.desiner` at `1280x720` and `509x642`; `policyhub` returned `Scope access denied`.

**Rationale:** The local acceptance gate is complete. Production identity, cross-application-service views, and graph acceleration require separate design, authorization, scale, and production evidence and must not be implied by this local gate.

**中文本地化：** 2026-08-10 已完成权威 Docker PostgreSQL 集成、Projector e2e 及桌面/移动端浏览器验收；桌面视口为 `1280x720`，移动视口为 `509x642`，`policyhub` Scope 返回访问拒绝。生产身份、跨应用服务视图和面向 Knowledge Assertion 的 Nebula 投影仍作为独立待办保留。
