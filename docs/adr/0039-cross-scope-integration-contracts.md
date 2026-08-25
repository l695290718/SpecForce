# ADR-0039: Governed Cross-Scope Integration Contracts and a Bounded Integration Atlas

## Status

Accepted as a V1 design. The Designer-owned Atlas and MCP contract-boundary increment is locally implemented and verified under `design-change-session:bf43d980-f32c-4440-ab35-557390e08c03`, but completion is blocked pending MCP synchronization because the local PostgreSQL service is unavailable. Every later consumer-scope contract write still requires its own exact-Scope session, facts, verification, and closure. Provider acknowledgement, bidirectional reconciliation, scanner ingestion, and automated external apply remain deferred.

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
- `pnpm db:push --accept-data-loss` passed against `localhost:15433/specforge_canonical`; it added only nullable Integration Atlas query projection columns and their Scope-bound indexes/uniqueness constraint, with no duplicate call-key conflict.
- `pnpm --filter @specforge/mcp-server exec vitest run src/tools.integration-v1.test.ts` passed (5 tests): V1 marker, ownership, source, tuple, and canonical-call-key validation.
- `pnpm --filter @specforge/web exec vitest run lib/integrations/atlas.test.ts` passed (5 tests): whole-response provider redaction, bounded continuation, cursor tampering/subject/waterline rejection, and readable inbound derivation.
- `pnpm --filter @specforge/mcp-server typecheck` and `pnpm --filter @specforge/web typecheck` passed. Container rebuild and live-browser verification are required before claiming deployment evidence.
- Deployment verification is externally blocked: `docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build --quiet-build` returned `Docker Desktop is unable to start` on 2026-08-25. Retry trigger: Docker Desktop is healthy, then rerun the existing `deploy/scripts/start.ps1` and verify `http://localhost:3010/assets/integrations`.
- **MCP synchronization blocked:** `SPECFORGE_DESIGN_FACT_IDS=adr-cross-scope-integration-contracts pnpm design-facts:sync` failed with `Can't reach database server at localhost:15433` after Docker Desktop stopped. Owner: deployment operator. Retry trigger: Docker Desktop and the bundled PostgreSQL service are healthy, then rerun design-fact synchronization, reconciliation, and the open session closure. Rationale: SpecForge's MCP write boundary cannot persist authored operational records while its authoritative PostgreSQL store is unavailable.

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
- `pnpm db:push --accept-data-loss` 已在 `localhost:15433/specforge_canonical` 通过；仅新增可空的 Atlas 查询投影列、Scope 索引和调用键唯一约束，未发现重复调用键冲突。
- MCP V1 校验与 Web Atlas 定向测试各 5 项通过，覆盖 V1 标记、归属/来源、目标元组、规范调用键、整包脱敏、续读及游标绑定。
- MCP 与 Web 类型检查通过。容器重建和浏览器实测完成前，不得声明部署证据。
- 部署验证受外部运行时阻塞：Docker Desktop 当前无法启动。恢复后执行既有 `deploy/scripts/start.ps1`，并验证 `http://localhost:3010/assets/integrations`。
- **MCP 同步被阻塞：** Docker Desktop 停止后，更新 ADR 的 MCP 写入无法连接 `localhost:15433`。负责人为部署运维；恢复 Docker Desktop 与 PostgreSQL 后，重新执行设计事实同步、对账和当前会话关闭。由于权威 PostgreSQL 不可用，当前不得宣称本次变更已完成。

## Evidence — Implementation Close (2026-08-24, session 4981705f)

Implemented under the Designer-scope preflight `design-change-session:4981705f-958b-4a08-8d2b-81494f82a66f` (web/app increment; no consumer-scope seed writes occurred, so no additional per-scope sessions were required). Commands and results:

- `pnpm --filter @specforge/mcp-server exec vitest run --pool=threads src/tools.integration-v1.test.ts` → **5 passed** (legacy passthrough, incomplete V1 identity rejected, missing locator rejected, incomplete RESOLVED target rejected, complete contract accepted).
- `node node_modules/vitest/vitest.mjs run --pool=threads lib/integrations` (apps/web) → **6 passed** (explicit empty page, provider redaction with no identity leak, inbound derivation from readable consumers only, legacy record stays UNRESOLVED, MAX_EDGES partial + cursor emitted, tampered cursor rejected).
- `pnpm exec tsc --noEmit -p apps/web` (repo root) → **exit 0**.
- `pnpm --filter @specforge/core test` → 7336 passed, 3 failed — the 3 failures are the pre-existing `three-a-workspace` coverage tests (`ReferenceError: React is not defined` at coverage-summary.tsx) that fail on a clean tree; unrelated to this increment.
- `pnpm --filter @specforge/web build` (SPECFORGE_NEXT_STANDALONE=0) → production build succeeded; dedicated `/assets/integrations` route present in `.next/server/app/assets/integrations`.
- Deploy: `docker compose build web && docker compose up -d --no-deps --force-recreate web` (deploy/); default web principal grants extended with read on all four application services in `deploy/.env` SPECFORGE_WEB_PRINCIPAL_CLAIMS plus core `defaultHuaweiActor` (write remains designer-only).
- CDP verification (headless Chrome against http://127.0.0.1:3010/assets/integrations?scope=com.huawei.celon.desiner): title rendered; coverage chips "Scopes inspected: 4 / Contracts scanned: 1 / Restricted targets: 0 / Unresolved targets: 1"; atlas SVG present with protocol-labeled edge; edge click opened the contract drawer (call key, locator placeholder "—", lifecycle ACTIVE); outbound row shows the legacy `integration-specforge-mcp-agent` as UNRESOLVED with locator "—"; no partial banner. Screenshot saved to `.tmp/atlas-verify.png`.
- MCP sync via `.tmp/upsert-integration-atlas.mts` after fresh dump (guards SHAPE_DRIFT at 15/51 and ALREADY_APPLIED marker "cross-scope integration contracts increment") → Proposal `proposal-specforge-self-design` now **16 specChanges**, Context Pack `ctx-specforge-self-design` now **52 instructions**, both EN canonical + ZH overlays, exact Designer scope.

Honest-state classification per AGENTS.md: **implemented and locally verified** — V1 typed fields, MCP boundary validation, bounded cursor aggregation, authorization redaction logic, integrations page with atlas canvas, four-scope read grants for the default deployment principal. **Deferred (backlog facts, not implemented)** — dual-side registration, reconciliation/drift detection, federation candidate promotion, per-contract versioning UI, and any seeded realistic call facts. No provider confirmation is implied by any edge shown.

**实现关闭证据（2026-08-24，会话 4981705f）：**

- 在 Designer Scope 预检 `design-change-session:4981705f-958b-4a08-8d2b-81494f82a66f` 下完成（Web/应用增量；未发生消费方种子写入，故无需额外按 Scope 会话）。
- MCP 校验器测试 5 通过；Atlas 聚合测试 6 通过（空态、提供方脱敏零泄露、入向仅来自可读消费方、旧记录保持未解析、MAX_EDGES 截断+游标、篡改游标拒绝）。
- Web 类型检查 exit 0；生产构建成功且专属路由存在；core 测试除 3 个干净树上同样失败的存量 coverage 用例外全部通过。
- 部署后 CDP 实测：覆盖芯片"检查 4 个 Scope / 扫描 1 条契约 / 受限 0 / 未解析 1"，画布含协议标注连线，点边打开契约抽屉，出向行显示旧记录 UNRESOLVED 且定位器为"—"，无截断横幅。
- MCP 同步经守卫后写入：Proposal 16 条 specChanges、Context Pack 52 条 instructions，英文规范 + 中文覆盖，精确 Designer Scope。
- 状态区分：已实现并本地验证——V1 类型字段、MCP 边界校验、有界游标聚合、授权脱敏、集成页面与图谱画布、默认主体四应用读授权；延期待办——双边登记、对账与漂移检测、联邦候选提升、契约版本化界面、任何仿真调用种子数据。图中任何边均不暗示提供方确认。
