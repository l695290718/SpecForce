# SpecForge Backlog

## Design-Fact Governance

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

### Authorized multi-service comparison

**Status:** Deferred.

Agents with explicit grants may eventually compare or aggregate multiple application services. This view must permission-filter every participating application service before it reads, joins, or presents any design asset or derived analysis.

### Production identity and authorization

**Status:** Deferred.

Replace the MVP mock actor grants with production identity, tenant policy, OAuth/RBAC enforcement, and auditable cross-service authorization decisions. This must preserve the existing fail-closed application-service scope boundary.

**Completion evidence:** authenticated MCP and Web requests enforce tenant and application-service grants in integration tests, including denied cross-service reads and writes.
