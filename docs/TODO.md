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
