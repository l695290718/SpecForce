# ADR-0039: Governed Cross-Scope Integration Contracts and a Bounded Integration Atlas

## Status

Accepted as a V1 design, but not yet accepted for implementation. This ADR was registered and read back through MCP in the exact Designer Scope under `design-change-session:4c717c05-02ba-43bd-b413-cccd331d5a44`. Each later consumer-scope implementation session must independently pass preflight, write its own facts, verify behavior, and close with evidence. No feature behavior is claimed by this ADR.

## Context

Huawei internal landscapes contain many application services that call each other through APIs, events, and files. SpecForge already uses one application-service scope per service (`com.huawei.celon.desiner`, `com.huawei.celon.integrationgateway`, `com.huawei.celon.specstudio`, and `com.huawei.celon.policyhub`), scope grants through `readableScopes`, and an `IntegrationContract` asset type. A call has a consumer-side business fact, but provider details can be protected by a different Scope. The previous design left four production risks open: one Designer session was incorrectly treated as sufficient for all consumer writes; contract identity did not bind a specific target operation or revision; read authorization could disclose provider details indirectly; and Atlas size limits had no executable query semantics.

## Decision

1. **Consumer-owned, target-bound contract.** A call is authored exactly once in its consumer Scope. Every V1 `IntegrationContract` has a stable `integrationCallKey`, consumer Scope ID, target kind (`SPEC_FORGE_SCOPE` or `EXTERNAL`), normalized protocol, protocol locator, lifecycle (`ACTIVE`, `DEPRECATED`, or `RETIRED`), and target-resolution status. A resolved internal target additionally records the provider application-service ID, the target asset type and stable ID, and the target revision or compatibility label. The key is idempotent over consumer, target binding, protocol, and locator; display names are never identity.
2. **Protocol locator is mandatory.** REST identifies method plus path or operation ID; gRPC identifies service plus method; message-event identifies direction plus topic/channel and schema or event ID when known; file identifies channel plus exchange name. A legacy or unknown protocol can be retained as `UNNORMALIZED`, but cannot be reported as a verified resolved target until a locator is supplied.
3. **Independent exact-Scope MCP sessions.** This ADR is registered only in the Designer Scope. A contract, its evidence, and any directional `CONSUMES` link are written through a separate preflight and close session in the owning consumer Scope. A consumer session never creates, edits, or links a provider-owned asset on behalf of the provider. First-day data is evidence-backed only; no realistic-looking mock call is seeded as a fact.
4. **Authorization-projected reads.** An Atlas request first proves access to each consumer Scope. Provider metadata is enriched only when the viewer can also read the provider Scope and target asset. Otherwise the response contains a deterministic restricted target node with no provider identity, asset detail, drawer detail, or target link. Inbound results are derived only from readable consumer contracts and explicitly report their coverage; absence never proves that no hidden consumer calls the active service.
5. **Bounded, resumable Atlas.** The server uses a stable order `(consumerScope, targetBinding, protocol, locator, contractId)` and an opaque cursor bound to the caller, active Scope, filters, and projection waterline. One request may inspect at most 50 readable scopes, return at most 500 contracts, 100 nodes, 200 edges, or 512 KiB, and spend at most 2 seconds in aggregation. It returns `partial`, a machine-readable reason (`MAX_SCOPES`, `MAX_CONTRACTS`, `MAX_NODES`, `MAX_EDGES`, `MAX_PAYLOAD`, or `TIMEOUT`), coverage counters, and a continuation cursor. The semantic list is the complete paginated surface; the canvas is always a bounded visual projection and visibly states when it is partial.
6. **No dual-side truth claim in V1.** Provider acknowledgement, bidirectional reconciliation, candidate promotion, scanner ingestion, and automated drift detection remain separate backlog facts. V1 reports consumer-authored evidence only and must not label an edge as provider-confirmed without a later reconciliation record.

## Alternatives

- **Gateway-hub centralization:** rejected. Assigning all contracts to `integrationgateway` makes one Scope a registry for every team and breaks consumer ownership.
- **Mandatory dual-side registration:** rejected for V1. It improves fidelity but duplicates authoring and requires reconciliation before it can be trustworthy.
- **Unbounded all-readable-Scopes graph:** rejected. It makes latency, payload, and authorization behavior non-deterministic at enterprise scale.

## Consequences

- Consumers have a precise, independently auditable authored fact. Provider ownership remains intact.
- A readable consumer contract can show that a dependency exists without leaking the provider's architecture. Hidden providers make Atlas coverage partial by design.
- The target binding and locator make a later reconciliation or compatibility check possible without matching human labels.
- The UI cannot treat the canvas as a complete inventory. Pagination, coverage, and partial state are part of its contract.
- V1 requires a small schema/API increment before the integrations surface can claim target verification; old records must be migrated as unresolved rather than guessed.

## Constraints

- PostgreSQL remains authoritative for authored contracts and relationship events; graph projections are derived and read-only.
- All authored writes use MCP with the exact consumer `architectureScope`; implicit, global, and cross-Scope writes are forbidden.
- Target asset links are directional, typed, revision-aware, and created only after target resolution passes authorization and existence checks.
- A response must distinguish complete, partial, restricted, unresolved, and unavailable states. A transport or projection failure must never be rendered as an empty graph.
- English fields are canonical; Chinese overlays are complete for human-facing decision content.

## Evidence

- Design review rewrote the V1 design to close session ownership, target identity, authorization-redaction, and bounded aggregation gaps; no feature implementation is claimed.
- `pnpm design-context:preflight -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --intent Revise-cross-scope-integration-contract-design --affected adr-cross-scope-integration-contracts --evidence adr-0039-design-review` was blocked with `DESIGN_CONTEXT_FACT_NOT_FOUND` before ADR registration. Retry follows exact-Scope manifest synchronization and read-back.
- `SPECFORGE_DESIGN_FACT_IDS=adr-cross-scope-integration-contracts pnpm design-facts:sync` completed; `pnpm design-facts:check` read back this ADR with no missing, mismatched, out-of-scope, or blocked facts. The exact-Scope recovery preflight opened `design-change-session:4c717c05-02ba-43bd-b413-cccd331d5a44`.
- The implementation close must append exact schema migration, focused API/query tests, authorization/redaction tests, cursor/budget tests, typecheck, build, and live browser checks. Provider-confirmation and production-scale evidence are not implied by local tests.

## MCP Record

- MCP ADR ID: `adr-cross-scope-integration-contracts`.
- Owning architectureScope: `com.huawei.celon.desiner` (`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`).
- Registration condition: MCP synchronization and read-back completed before code implementation. A future failed write must be recorded as `MCP synchronization blocked` with its reason and retry trigger.
- Related records: Proposal `proposal-specforge-self-design`, Context Pack `ctx-specforge-self-design`, API `api-specforge-mcp-tools`, and later evidence-backed IntegrationContract assets in their owning consumer Scopes.

## 中文本地化

**背景：**

华为内部存在大量通过 API、事件和文件互相调用的应用服务。SpecForge 已为每个服务使用独立应用服务 Scope（`com.huawei.celon.desiner`、`com.huawei.celon.integrationgateway`、`com.huawei.celon.specstudio` 和 `com.huawei.celon.policyhub`），通过 `readableScopes` 授权，并提供 `IntegrationContract` 资产类型。一条调用是消费方侧的业务事实，但提供方细节可能受另一个 Scope 保护。原设计遗留四项生产风险：错误地把一个 Designer 会话视为足以覆盖所有消费方写入；契约身份未绑定具体目标操作或修订版本；读取授权可能间接暴露提供方细节；Atlas 的规模限制没有可执行的查询语义。

**决策：**

1. **消费方归属、目标绑定的契约。** 一条调用只在消费方 Scope 中编写一次。每个 V1 `IntegrationContract` 都拥有稳定的 `integrationCallKey`、消费方 Scope ID、目标类型、规范化协议、协议定位器、生命周期和目标解析状态。已解析内部目标还记录提供方应用服务 ID、目标资产类型与稳定 ID，以及目标修订或兼容性标签。展示名称绝不能充当身份。
2. **协议定位器必填。** REST 使用 method 加 path 或 operation ID；gRPC 使用 service 加 method；消息事件使用方向加 topic/channel，并在已知时带 schema 或 event ID；文件使用 channel 加交换名称。`UNNORMALIZED` 记录在提供定位器前不得被报告为已校验目标。
3. **独立精确 Scope MCP 会话。** 本 ADR 只在 Designer Scope 注册。每条契约、证据及方向性 `CONSUMES` 链接均在所属消费方 Scope 通过独立预检和关闭会话写入，不得代表提供方写入资产。首日只写入有证据的事实。
4. **授权投影读取。** 先验证消费方 Scope 访问权。仅当查看者还能读取提供方 Scope 和目标资产时才补充提供方细节；否则返回确定性受限节点。入向结果只从可读消费方契约推导，并报告覆盖范围。
5. **有界可续读 Atlas。** 采用稳定排序和绑定调用者、活动 Scope、过滤条件及投影水位的不透明游标。单次最多检查 50 个 Scope、返回 500 条契约、100 个节点、200 条边或 512 KiB，最多 2 秒；返回部分原因、覆盖统计与续读游标。列表是完整分页界面，画布是有界投影。
6. **V1 不声明双边真实性。** 提供方确认、双向对账、候选提升、扫描器接入和自动漂移检测保持为独立待办；没有对账记录不得声称提供方已确认。

**备选方案：**

- **网关集中式：**否决。将全部契约归属到 `integrationgateway` 会让一个 Scope 成为所有团队的登记处，并破坏消费方归属。
- **强制双边登记：**V1 否决。它提高保真度，但会重复编写，且在具备对账能力前并不可信。
- **无界的全部可读 Scope 图：**否决。它会使企业规模下的时延、负载和授权行为不可预测。

**后果：**

- 消费方获得可精确审计、独立归属的编写事实，提供方归属保持不变。
- 可读消费方契约能够说明依赖存在，同时不泄露提供方架构；隐藏提供方会使 Atlas 覆盖范围按设计成为部分结果。
- 目标绑定和定位器使后续对账或兼容性检查能够依据稳定事实执行，而非匹配人工名称。
- UI 不能把画布当作完整清单；分页、覆盖范围和部分状态是其契约的一部分。
- 在集成界面宣称目标已校验前，V1 需要小型 schema/API 增量；旧记录迁移为未解析，不得猜测目标。

**约束：**

- PostgreSQL 对已编写契约和关系事件保持权威；图投影为派生且只读。
- 所有编写写入都通过 MCP 使用精确消费方 `architectureScope`；禁止隐式、全局和跨 Scope 写入。
- 目标资产链接必须有方向、有类型、具备修订意识，并仅在目标解析通过授权和存在性检查后创建。
- 响应必须区分完整、部分、受限、未解析和不可用状态；传输或投影失败绝不得渲染为空图。
- 英文字段为规范字段；所有面向人的决策内容提供完整中文覆盖。

**证据：**

- 设计审查已重写 V1 设计，补齐会话归属、目标身份、授权脱敏和有界聚合缺口；未声明功能实现。
- ADR 注册前预检曾返回 `DESIGN_CONTEXT_FACT_NOT_FOUND`；随后精确 Scope 清单同步与回读成功，无缺失、错配、越界或阻塞事实，并打开恢复会话 `design-change-session:4c717c05-02ba-43bd-b413-cccd331d5a44`。
- 实现关闭时必须追加精确 schema 迁移、聚焦 API/查询、授权/脱敏、游标/预算测试、类型检查、构建及浏览器实测；本地测试不推断提供方确认或生产规模。
