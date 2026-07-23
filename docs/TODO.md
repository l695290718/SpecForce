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

**Status:** Blocked on configured PostgreSQL/MCP availability.

**Owner:** SpecForge Architecture.

**Rationale:** ADR `adr-federated-design-fact-synchronization`, its Proposal, Context Pack, `IMPLEMENTS_DECISION`, `IMPLEMENTS_CONTEXT_FOR`, `DECIDES`, and `VALIDATES` links, and six manifest-declared Evidence assets are declared but cannot be written or read back without a reachable `DATABASE_URL`.

**MCP synchronization blocked:** Owner: SpecForge Architecture. The configured `DATABASE_URL`, `SPECFORGE_APPLICATION_SERVICE_ID`, and `SPECFORGE_SCOPE_PATH` are unavailable in the current environment.

**中文本地化：** 状态为 MCP 同步受阻；负责人为 SpecForge Architecture；原因是当前环境缺少 `DATABASE_URL` 以及精确 Scope 变量 `SPECFORGE_APPLICATION_SERVICE_ID` 和 `SPECFORGE_SCOPE_PATH`。重试触发条件是配置 PostgreSQL 和精确 Scope，运行 `pnpm design-facts:sync`、`pnpm design-facts:check` 和联邦检查，再回读同步收据。

**Retry trigger:** Configure a reachable PostgreSQL `DATABASE_URL`, then run `pnpm design-facts:sync`, `pnpm design-facts:check`, and `SPECFORGE_APPLICATION_SERVICE_ID=com.huawei.celon.desiner SPECFORGE_SCOPE_PATH=pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner pnpm design-facts:federation:check`.

### Complete federation integration hardening slices two and three

**Status:** Locally implemented; MCP synchronization blocked.

**Owner:** SpecForge Architecture.

**Rationale:** Slices 2A through 3B locally implement the federated authorization, candidate-binding, audit recovery, transactional delivery, connector readiness, source-version determinism, reconciliation ordering, and audit redaction contracts. The audit failure contract is `FEDERATION_TOOL_ERROR;diagnosticRef=<64-hex SHA-256 digest>`; raw exception and credential text must never be persisted in `AuditLog.errorMessage`.

**中文本地化：** 第 2A 至 3B 轮次已在本地实现联邦授权、候选绑定、审计恢复、事务投递、连接器就绪性、来源版本确定性、对账排序和审计脱敏契约。审计失败契约为 `FEDERATION_TOOL_ERROR;diagnosticRef=<64 位十六进制 SHA-256 摘要>`；原始异常和凭据文本不得持久化到 `AuditLog.errorMessage`。

**MCP synchronization blocked:** The repository ADR and baseline manifest are updated, but the matching MCP assets, sixth Evidence record, and `VALIDATES` read-back cannot be verified because `DATABASE_URL`, `SPECFORGE_APPLICATION_SERVICE_ID`, and `SPECFORGE_SCOPE_PATH` are unavailable.

**Retry trigger:** Configure a reachable PostgreSQL `DATABASE_URL` and exact Scope variables, run `pnpm design-facts:sync`, `pnpm design-facts:check`, and `SPECFORGE_APPLICATION_SERVICE_ID=com.huawei.celon.desiner SPECFORGE_SCOPE_PATH=pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner pnpm design-facts:federation:check`, then read back the ADR, sixth Evidence/`VALIDATES` link, localized fields, and audit-security contract.


## Enterprise Impact Analysis

### NebulaGraph production projection

**Status:** Pending production-profile verification.

Implement the NebulaGraph 3.8.0 projection path described in the enterprise impact-analysis design:

- add the Go graph gateway using the official NebulaGraph Go client;
- provision the supported local Docker Compose profile, or configure a reachable shared NebulaGraph 3.8.0 cluster;
- create the `specforge_graph` space, verify vertex and edge writes, and verify multi-hop traversal;
- add the idempotent PostgreSQL outbox projector, checkpointing, retry handling, and graph health telemetry; and
- complete the GraphStore/Nebula integration and MCP smoke suites.

**Completion evidence:** a repeatable NebulaGraph 3.8.0 compatibility test using the official Go client, followed by the complete integration and smoke suites.

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
