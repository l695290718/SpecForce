# Federated Design-Fact Synchronization

## Status

**Accepted. Governance core is implemented; MCP synchronization and read-back are verified against the configured Docker PostgreSQL authority at `localhost:5433`.**

- Stable ADR/MCP ID: `adr-federated-design-fact-synchronization`
- Owning `architectureScope.applicationServiceId`: `com.huawei.celon.desiner`
- Owning `architectureScope.scopePath`: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

## Context

SpecForge needs one governed way to represent externally observed implementation facts without granting external systems authority over approved design intent. The first delivery must establish exact Scope isolation, source-neutral federation records, policy-driven candidate promotion, durable delivery/audit behavior, and read-only reconciliation while avoiding unproven claims about scanners or external mutation.

## Decision

Adopt the federated design-fact governance core described in `docs/superpowers/specs/2026-07-19-federated-design-fact-synchronization-design.md`. The implemented increment provides canonical envelopes, deterministic digests, authority and identity conflict decisions, scoped PostgreSQL state, durable federation outbox records, MCP governance tools with exact Scope authorization and audit intent, and a read-only Designer Scope reconciliation gate.

MCP remains the only authored SpecForge design-fact write boundary. PostgreSQL is authoritative for authored federation state and relationship events; graph stores remain derived projections. The matching ADR, Proposal, Context Pack, typed `IMPLEMENTS_DECISION`, `IMPLEMENTS_CONTEXT_FOR`, `DECIDES`, and `VALIDATES` links, and Evidence assets are declared through the baseline manifest and must be persisted through MCP in the exact Designer Scope.

This decision implements governance core only. Git, OpenAPI, and PostgreSQL discovery scanners; continuous inbound observations/checkpoints; outbound proposals; and external `APPLY` are deferred. The reconciliation command is read-only and does not scan, repair, promote, or apply external changes.

## Alternatives

1. **Implement connector scanners and external mutation with the core.** Rejected because discovery, continuous inbound processing, proposals, and `APPLY` need connector-specific contracts and evidence beyond this safe first increment.
2. **Use last-writer-wins for observed facts.** Rejected because ambiguous identity and shared authority must block promotion rather than silently overwrite governed intent.
3. **Persist federation records directly to PostgreSQL from scripts.** Rejected because authored design facts, proposals, context packs, links, and evidence must cross the MCP write boundary.
4. **Treat reconciliation as repair.** Rejected because a verification gate must expose drift without changing records or external systems.

## Consequences

- Positive: Federation records are isolated to their exact application-service Scope and have durable provenance, audit, and delivery state.
- Positive: Ambiguous identity, missing authority, Scope drift, localization drift, and blocked delivery can stop automatic promotion or protected completion.
- Positive: Future connectors can target the stable contract without changing governance ownership or the MCP authoring boundary.
- Tradeoff: The current increment has no legacy scanner, continuous inbound connector, outbound proposal, or production `APPLY` capability.
- Tradeoff: PostgreSQL/MCP availability is required to persist and reconcile the matching operational design records.
- Tradeoff: New connector capabilities require separate scope-safe design records, evidence, and MCP reconciliation before they can be claimed.

## Constraints

- All authored records and links use only `com.huawei.celon.desiner` and `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- English remains canonical and every human-facing record must contain a complete Chinese overlay.
- PostgreSQL remains authoritative for authored assets, federation state, relationship events, outbox records, and audit records; graph stores are derived only.
- Reconciliation is read-only; it must not scan external systems, repair drift, promote candidates, deliver proposals, or execute `APPLY`.
- External identities are scoped durable keys; display names are not identity keys, and last-writer-wins is forbidden.

## Evidence

- **Implemented:** `packages/core/src/federation/` provides source-neutral envelope, digest, authority, and reconciliation contracts.
- **Implemented:** `apps/mcp-server/src/federation/` provides exact-Scope persistence and MCP governance tools with durable audit/outbox behavior.
- **Implemented:** `scripts/reconcile-federated-facts.ts` exposes a read-only local Designer Scope reconciliation gate.
- **Locally verified:** `node .\\node_modules\\vitest\\vitest.mjs run scripts/design-fact-manifest.test.ts` passed after adding this stable ADR to the baseline manifest.
- **Locally verified:** `node .\\node_modules\\vitest\\vitest.mjs run packages\\core\\src\\__tests__` passed 12 files and 126 tests; `pnpm --filter @specforge/core typecheck` passed.
- **Locally verified:** `node .\\node_modules\\vitest\\vitest.mjs run apps\\mcp-server\\src` passed 12 files and 144 tests; 9 PostgreSQL integration tests were skipped without `DATABASE_URL`; `pnpm --filter @specforge/mcp-server typecheck` passed.
- **Pending environment verification:** `pnpm design-facts:sync`, `pnpm design-facts:check`, and the configured-scope federation check require a reachable configured PostgreSQL database and must not be claimed before they run.

## MCP Record

- Matching MCP ADR ID: `adr-federated-design-fact-synchronization`
- Exact owning `architectureScope`: `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Matching Proposal: `proposal-federated-design-fact-governance-core`
- Matching Context Pack: `context-pack-federated-design-fact-governance`
- Related assets: `api-specforge-mcp-tools`, `data-specforge-assets`, `data-specforge-asset-graph`, and `adr-design-fact-dual-record-governance`.
- Typed links: Proposal `--IMPLEMENTS_DECISION-->` ADR; Context Pack `--IMPLEMENTS_CONTEXT_FOR-->` Proposal; ADR `--DECIDES-->` each related asset (`api`, `dataModel`, and `adr` targets); each Evidence asset `--VALIDATES-->` ADR.
- Evidence IDs: `evidence-adr-federated-design-fact-synchronization-1` through `evidence-adr-federated-design-fact-synchronization-6`; each is linked to this ADR with `VALIDATES` by the manifest-driven sync.
- **MCP synchronization blocked:** Owner: SpecForge Architecture. The matching records are manifest-driven, but synchronization is blocked because `DATABASE_URL`, `SPECFORGE_APPLICATION_SERVICE_ID`, and `SPECFORGE_SCOPE_PATH` are unavailable in this worktree environment. Retry trigger: configure reachable PostgreSQL plus the exact Designer Scope variables, run `pnpm design-facts:sync`, then `pnpm design-facts:check` and the configured-scope federation check, and read back the persisted IDs, Scope, canonical English fields, Chinese overlays, links, and evidence.

## Integration Hardening Update (2026-07-19)

The first hardening slice makes three governance boundaries fail closed. `reconcile_federated_scope` accepts only an exact Scope and loads promoted canonical envelopes from persisted state. Candidate promotion requires a mapped asset identity, validates the selected observation's digest and provenance, derives promoted content and policy-owned fields server-side, and always enforces complete bilingual localization. Reconciliation and its CLI gate now block every governed non-converged issue instead of allowing content-only or missing-fact drift to return success.

Local evidence: the focused core/CLI command passed 30 tests; the focused MCP/persistence command passed 64 tests; both package typechecks passed. PostgreSQL integration and MCP synchronization/read-back were not run without a reachable `DATABASE_URL`. The broader integration-hardening effort remains in progress because the separately tracked second slice is still pending.

## Integration Hardening Slice 2C (2026-07-19)

Successful mutations whose AuditLog terminal update fails now retain the intended success `outputSummary` in a `SUCCESS_REPAIR_REQUIRED` marker with `AUDIT_FINALIZATION_RETRY_REQUIRED`. The exported `retryFederationAuditFinalization` consumer reads that marker and converges it to `success`; repeated retries after convergence are idempotent. Marker-write failure returns the stable audit persistence error and does not expose database details.

Local evidence: the focused MCP federation command passed 2 files and 76 tests; core and MCP typechecks passed; `git diff --check` passed. Live PostgreSQL and MCP synchronization/read-back remain unverified. **MCP synchronization blocked:** Owner: SpecForge Architecture. Reason: `DATABASE_URL`, `SPECFORGE_APPLICATION_SERVICE_ID`, and `SPECFORGE_SCOPE_PATH` are unavailable. Retry trigger: configure PostgreSQL and the exact Designer Scope variables, run `pnpm design-facts:sync`, `pnpm design-facts:check`, and the configured-scope federation check, then read back the records.

## Integration Hardening Slice 2D (2026-07-19)

The protected `retry_federation_audit_finalization` MCP maintenance tool now invokes the repair consumer through the audited federation wrapper. It requires `asset:read`, `asset:write`, and `governance:run`, exact application-service Scope grants, and a persisted audit input summary whose Scope matches the requested Scope; unscoped or cross-Scope audit IDs fail closed. The maintenance operation is idempotent after success.

Local evidence: focused federation/MCP and manifest tests passed; core and MCP typechecks passed; `git diff --check` passed. **MCP synchronization blocked:** Owner: SpecForge Architecture. Reason: `DATABASE_URL`, `SPECFORGE_APPLICATION_SERVICE_ID`, and `SPECFORGE_SCOPE_PATH` are unavailable. Retry trigger: configure PostgreSQL and exact Scope variables, run `pnpm design-facts:sync`, `pnpm design-facts:check`, and the federation check, then read back sync receipts. No synchronization success is claimed.

## Integration Hardening Slice 3C (2026-07-19)

Federation failures now have an explicit audit-security contract. A failed federation call persists only the stable code `FEDERATION_TOOL_ERROR` plus a deterministic `diagnosticRef=<64-hex SHA-256 digest>` in `AuditLog.errorMessage`. The digest is derived from the action, target identifiers, and private exception detail for correlation; raw exception messages, passwords, tokens, secret references, and other credential text are never persisted. Client responses continue to expose only the existing safe stable error code and message.

The baseline manifest records this contract in complete English and Chinese localized fields. It also adds `evidence-adr-federated-design-fact-synchronization-6`; the existing manifest-driven sync convention will create its `VALIDATES` link to this ADR together with the existing Proposal, Context Pack, related-asset, and Evidence links. The repository record is locally updated only; PostgreSQL/MCP persistence and read-back remain unverified.

Local evidence: `node .\\node_modules\\.pnpm\\vitest@2.1.9_@types+node@22.20.1\\node_modules\\vitest\\vitest.mjs run apps\\mcp-server\\src\\federation\\tools.test.ts apps\\mcp-server\\src\\federation\\persistence.test.ts` passed 2 files and 96 tests; core and MCP typechecks passed; `git diff --check` passed.

## Docker PostgreSQL Synchronization Verification (2026-07-23)

The configured Docker PostgreSQL authority at `localhost:5433/specforge` is reachable. `pnpm design-facts:sync` persisted the complete eight-decision baseline through MCP; `pnpm design-facts:check` read back all eight decisions with no missing, mismatched, out-of-scope, or blocked records. The exact Designer Scope federation reconciliation returned `blocking: false`, zero verified federated facts, and no issue counts. This verification supersedes the earlier environment-blocked notes above, which remain as historical implementation evidence.

### Slice 3C Chinese Localization

联邦失败现在具有明确的审计安全契约。失败的联邦调用只在 `AuditLog.errorMessage` 中保存稳定代码 `FEDERATION_TOOL_ERROR` 和确定性的 `diagnosticRef=<64 位十六进制 SHA-256 摘要>`。摘要由操作、目标标识符和私有异常细节生成，用于关联诊断；不会持久化原始异常消息、密码、令牌、密钥引用或其他凭据文本。客户端仍只获得现有的安全稳定错误代码和消息。

基线清单以完整的英文规范字段和中文本地化字段记录该契约，并新增 `evidence-adr-federated-design-fact-synchronization-6`；现有清单驱动同步约定会为该证据创建指向本 ADR 的 `VALIDATES` 关系，同时保留既有 Proposal、Context Pack、相关资产和 Evidence 关系。本次仅完成仓库记录更新，PostgreSQL/MCP 持久化和回读仍未核验。

本地证据：`node .\\node_modules\\.pnpm\\vitest@2.1.9_@types+node@22.20.1\\node_modules\\vitest\\vitest.mjs run apps\\mcp-server\\src\\federation\\tools.test.ts apps\\mcp-server\\src\\federation\\persistence.test.ts` 通过 2 个文件、96 个测试；core 和 MCP 类型检查通过；`git diff --check` 通过。

**MCP synchronization blocked：** 负责人：SpecForge Architecture。原因：当前环境缺少 `DATABASE_URL`、`SPECFORGE_APPLICATION_SERVICE_ID` 和 `SPECFORGE_SCOPE_PATH`。重试触发条件：配置可访问的 PostgreSQL 和精确 Designer Scope 变量，运行 `pnpm design-facts:sync`、`pnpm design-facts:check` 和配置 Scope 的联邦检查，然后回读第六个 Evidence 收据以及全部 ID、Scope、英文规范字段、中文覆盖、类型关系和诊断引用。本轮不声明同步成功。

### Slice 2D Chinese Localization

受保护的 `retry_federation_audit_finalization` MCP 维护工具通过可审计的联邦包装器调用审计修复。它要求 `asset:read`、`asset:write` 和 `governance:run` 权限、精确的应用服务 Scope 授权，以及与请求 Scope 完全匹配的持久化审计 Scope；无 Scope 或跨 Scope 的审计 ID 会安全拒绝。成功后的重复维护调用是幂等的。

**MCP synchronization blocked：** 负责人：SpecForge Architecture。原因：当前环境缺少 `DATABASE_URL`、`SPECFORGE_APPLICATION_SERVICE_ID` 和 `SPECFORGE_SCOPE_PATH`。重试触发条件：配置 PostgreSQL 和精确 Scope 变量，运行 `pnpm design-facts:sync`、`pnpm design-facts:check` 和联邦检查，再回读同步收据。本轮不声明同步成功。

### 第2C轮中文本地化 / Slice 2C Chinese Localization

成功变更的审计终结写入失败时，系统保留原始成功输出摘要，并写入可恢复的 `SUCCESS_REPAIR_REQUIRED` 标记；`retryFederationAuditFinalization` 可将该标记幂等收敛为 `success`。标记写入失败时仅返回稳定的审计持久化错误，不向客户端暴露数据库细节。

**MCP synchronization blocked：** 负责人：SpecForge Architecture。原因：当前环境缺少可用的 `DATABASE_URL`、`SPECFORGE_APPLICATION_SERVICE_ID` 和 `SPECFORGE_SCOPE_PATH`。重试触发条件：配置可访问的 PostgreSQL 和精确 Designer Scope 变量，依次运行 `pnpm design-facts:sync`、`pnpm design-facts:check` 和联邦 Scope 检查，再回读 ID、范围、英文规范字段、中文覆盖、关系和证据。

## 中文本地化 / Chinese Localization

### 标题

联邦设计事实同步

### 状态

**已接受。治理核心已实现；已在 `localhost:5433` 的 Docker PostgreSQL 权威库完成 MCP 同步和回读核验。**

- 稳定 ADR/MCP ID：`adr-federated-design-fact-synchronization`
- 所属 `architectureScope.applicationServiceId`：`com.huawei.celon.desiner`
- 所属 `architectureScope.scopePath`：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

### Docker PostgreSQL 同步核验（2026-07-23）

已配置的 Docker PostgreSQL 权威库 `localhost:5433/specforge` 可访问。`pnpm design-facts:sync` 已通过 MCP 持久化完整的 8 项决策基线；`pnpm design-facts:check` 回读全部 8 项决策，未发现缺失、不匹配、越界或受阻记录。精确 Designer Scope 的联邦对账返回 `blocking: false`、零项已核验联邦事实和空问题计数。该核验结果取代上文历史实现记录中的环境受阻说明。

### 背景

SpecForge 需要一种受治理的方式来表示外部观察到的实现事实，同时不把已批准设计意图的权威交给外部系统。首个交付必须建立精确 Scope 隔离、来源无关的联邦记录、策略驱动的候选事实提升、可靠投递/审计行为和只读对账，同时避免对扫描器或外部变更作出未经验证的声明。

### 决策

采用 `docs/superpowers/specs/2026-07-19-federated-design-fact-synchronization-design.md` 中描述的联邦设计事实治理核心。已实现的增量提供规范事实信封、确定性摘要、权威与身份冲突决策、受 Scope 约束的 PostgreSQL 状态、可靠的联邦 Outbox 记录、带精确 Scope 授权和审计意图的 MCP 治理工具，以及只读的 Designer Scope 对账门禁。

MCP 仍是已编写 SpecForge 设计事实的唯一写入边界。PostgreSQL 是已编写联邦状态和关系事件的权威来源；图存储仍是派生投影。匹配的 ADR、Proposal、Context Pack、有类型的 `IMPLEMENTS_DECISION`、`IMPLEMENTS_CONTEXT_FOR`、`DECIDES` 和 `VALIDATES` 关系以及 Evidence 资产均由基线清单声明，必须通过 MCP 写入精确的 Designer Scope。

本决策仅实现治理核心。Git、OpenAPI 和 PostgreSQL 发现扫描器、持续入站 Observation/检查点、出站 Proposal 和外部 `APPLY` 均为延期能力。对账命令只读，不扫描、修复、提升或应用外部变更。

### 备选方案

1. **与核心同时实现连接器扫描器和外部变更。** 拒绝，因为发现、持续入站处理、Proposal 和 `APPLY` 需要超出本安全首个增量范围的连接器专属契约和证据。
2. **对观察到的事实采用最后写入者获胜。** 拒绝，因为模糊身份和共享权威必须阻止提升，不能静默覆盖受治理的意图。
3. **由脚本直接写入 PostgreSQL。** 拒绝，因为已编写的设计事实、Proposal、Context Pack、关系和 Evidence 必须经过 MCP 写入边界。
4. **把对账当作修复操作。** 拒绝，因为验证门禁必须暴露漂移而不修改记录或外部系统。

### 后果

- 积极影响：联邦记录被隔离在精确应用服务 Scope 内，拥有可靠的来源、审计和投递状态。
- 积极影响：模糊身份、缺少权威、Scope 漂移、本地化漂移和投递受阻可以停止自动提升或受保护完成。
- 积极影响：未来连接器可以使用稳定契约，而无需改变治理所有权或 MCP 编写边界。
- 权衡：当前增量没有存量扫描器、持续入站连接器、出站 Proposal 或生产 `APPLY` 能力。
- 权衡：需要 PostgreSQL/MCP 可用性来持久化和对账匹配的运行设计记录。
- 权衡：新增连接器能力在被声明前需要独立且 Scope 安全的设计记录、证据和 MCP 对账。

### 约束

- 所有已编写记录和关系只使用 `com.huawei.celon.desiner` 与 `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`。
- 英文仍为规范内容，每个面向人的记录必须具备完整中文覆盖。
- PostgreSQL 对已编写资产、联邦状态、关系事件、Outbox 记录和审计记录保持权威；图存储仅为派生投影。
- 对账只读；不得扫描外部系统、修复漂移、提升候选事实、投递 Proposal 或执行 `APPLY`。
- 外部身份是受 Scope 约束的可靠键；显示名称不是身份键，禁止最后写入者获胜。

### 证据

- **已实现：** `packages/core/src/federation/` 提供来源无关的信封、摘要、权威和对账契约。
- **已实现：** `apps/mcp-server/src/federation/` 提供精确 Scope 持久化以及带可靠审计/Outbox 行为的 MCP 治理工具。
- **已实现：** `scripts/reconcile-federated-facts.ts` 提供只读的本地 Designer Scope 对账门禁。
- **已本地验证：** 在基线清单加入此稳定 ADR 后，`node .\\node_modules\\vitest\\vitest.mjs run scripts/design-fact-manifest.test.ts` 通过。
- **已本地验证：** `node .\\node_modules\\vitest\\vitest.mjs run packages\\core\\src\\__tests__` 通过，共 12 个文件和 126 个测试；`pnpm --filter @specforge/core typecheck` 通过。
- **已本地验证：** `node .\\node_modules\\vitest\\vitest.mjs run apps\\mcp-server\\src` 通过，共 12 个文件和 144 个测试；由于没有 `DATABASE_URL`，9 个 PostgreSQL 集成测试被跳过；`pnpm --filter @specforge/mcp-server typecheck` 通过。
- **已验证：** `pnpm design-facts:sync` 与 `pnpm design-facts:check` 已针对 `localhost:5433/specforge` 通过 MCP 持久化并回读全部 8 个基线 ADR；没有缺失、不匹配、越界或受阻记录。精确 Designer Scope 的联邦对账返回 `blocking: false`，没有问题计数。

### MCP 记录

- 匹配的 MCP ADR ID：`adr-federated-design-fact-synchronization`
- 精确所属 `architectureScope`：`com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 匹配 Proposal：`proposal-federated-design-fact-governance-core`
- 匹配 Context Pack：`context-pack-federated-design-fact-governance`
- 相关资产：`api-specforge-mcp-tools`、`data-specforge-assets`、`data-specforge-asset-graph` 和 `adr-design-fact-dual-record-governance`。
- 有类型关系：Proposal `--IMPLEMENTS_DECISION-->` ADR；Context Pack `--IMPLEMENTS_CONTEXT_FOR-->` Proposal；ADR `--DECIDES-->` 每个相关资产（目标类型为 `api`、`dataModel` 和 `adr`）；每个 Evidence 资产 `--VALIDATES-->` ADR。
- Evidence ID：`evidence-adr-federated-design-fact-synchronization-1` 至 `evidence-adr-federated-design-fact-synchronization-6`；每个 Evidence 资产都通过清单驱动同步以 `VALIDATES` 关系指向本 ADR。
- **MCP 同步已核验：** 匹配记录已由清单驱动通过 MCP 持久化，并由 `pnpm design-facts:check` 回读。后续设计事实变更必须重新运行 `pnpm design-facts:sync`、`pnpm design-facts:check` 和精确 Designer Scope 的联邦对账命令后才能完成。

### 集成加固更新（2026-07-19）

第一轮加固使三个治理边界按失败关闭。`reconcile_federated_scope` 只接收精确 Scope，并从持久化状态加载已提升的规范信封。候选提升要求映射后的资产身份，校验所选观察的内容摘要和来源，根据持久化候选、映射及策略在服务端生成正式内容，并始终要求完整中英文覆盖。核心对账及 CLI 门禁现在会阻断所有受治理的不收敛问题，不再允许仅内容漂移或事实缺失返回成功。

本地证据：core/CLI 聚焦命令通过 30 个测试；MCP/持久化聚焦命令通过 64 个测试；两个包的类型检查均通过。由于没有可访问的 `DATABASE_URL`，未运行 PostgreSQL 集成及 MCP 同步/回读。单独跟踪的第二轮尚未完成，因此整体集成加固仍在进行中。
