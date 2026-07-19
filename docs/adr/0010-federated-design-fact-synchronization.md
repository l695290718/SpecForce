# Federated Design-Fact Synchronization

## Status

**Accepted. Governance core is implemented; MCP synchronization and read-back remain pending the configured PostgreSQL/MCP environment.**

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

Positive consequences:

- Federation records are isolated to their exact application-service Scope and have durable provenance, audit, and delivery state.
- Ambiguous identity, missing authority, Scope drift, localization drift, and blocked delivery can stop automatic promotion or protected completion.
- Future connectors can target the stable contract without changing governance ownership or the MCP authoring boundary.

Tradeoffs:

- The current increment has no legacy scanner, continuous inbound connector, outbound proposal, or production `APPLY` capability.
- PostgreSQL/MCP availability is required to persist and reconcile the matching operational design records.
- New connector capabilities require separate scope-safe design records, evidence, and MCP reconciliation before they can be claimed.

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
- Related assets: `api-specforge-mcp-tools`, `data-specforge-assets`, and `data-specforge-asset-graph`.
- Typed links: Proposal `--IMPLEMENTS_DECISION-->` ADR; Context Pack `--IMPLEMENTS_CONTEXT_FOR-->` Proposal; ADR `--DECIDES-->` each related asset; each Evidence asset `--VALIDATES-->` ADR.
- Evidence IDs: `evidence-adr-federated-design-fact-synchronization-1` through `evidence-adr-federated-design-fact-synchronization-3`.
- **MCP synchronization blocked:** the matching records are manifest-driven, but they are not complete until `pnpm design-facts:sync` persists them and `pnpm design-facts:check` reads them back through MCP. Retry trigger: run both commands with a reachable configured `DATABASE_URL`, then run the exact Designer Scope federation reconciliation command.

## 中文本地化 / Chinese Localization

### 状态

**已接受。治理核心已实现；MCP 同步和回读仍等待已配置的 PostgreSQL/MCP 环境。**

- 稳定 ADR/MCP ID：`adr-federated-design-fact-synchronization`
- 所属 `architectureScope.applicationServiceId`：`com.huawei.celon.desiner`
- 所属 `architectureScope.scopePath`：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

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

积极后果：联邦记录被隔离在精确应用服务 Scope 内，拥有可靠的来源、审计和投递状态；模糊身份、缺少权威、Scope 漂移、本地化漂移和投递受阻可以停止自动提升或受保护完成；未来连接器可以使用稳定契约，而无需改变治理所有权或 MCP 编写边界。

权衡：当前增量没有存量扫描器、持续入站连接器、出站 Proposal 或生产 `APPLY` 能力；需要 PostgreSQL/MCP 可用性来持久化和对账匹配的运行设计记录；新增连接器能力在被声明前需要独立且 Scope 安全的设计记录、证据和 MCP 对账。

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
- **等待环境验证：** `pnpm design-facts:sync`、`pnpm design-facts:check` 和已配置 Scope 的联邦对账检查需要可访问且已配置的 PostgreSQL 数据库；在实际运行前不得声明其结果。

### MCP 记录

- 匹配的 MCP ADR ID：`adr-federated-design-fact-synchronization`
- 精确所属 `architectureScope`：`com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 匹配 Proposal：`proposal-federated-design-fact-governance-core`
- 匹配 Context Pack：`context-pack-federated-design-fact-governance`
- 相关资产：`api-specforge-mcp-tools`、`data-specforge-assets` 和 `data-specforge-asset-graph`。
- 有类型关系：Proposal `--IMPLEMENTS_DECISION-->` ADR；Context Pack `--IMPLEMENTS_CONTEXT_FOR-->` Proposal；ADR `--DECIDES-->` 每个相关资产；每个 Evidence 资产 `--VALIDATES-->` ADR。
- Evidence ID：`evidence-adr-federated-design-fact-synchronization-1` 至 `evidence-adr-federated-design-fact-synchronization-3`。
- **MCP 同步受阻：** 匹配记录由清单驱动，但只有在 `pnpm design-facts:sync` 通过 MCP 持久化并由 `pnpm design-facts:check` 回读后才完整。重试触发条件：使用可访问且已配置的 `DATABASE_URL` 运行这两个命令，然后运行精确 Designer Scope 的联邦对账命令。
