# Integration Contract Verification States Design

**Status:** Implemented and synchronized for the exact Designer Scope; scanner scheduling, provider acknowledgement, bidirectional reconciliation, drift alerting, and external APPLY remain deferred.
**Scope:** `com.huawei.celon.desiner`
**Owner:** SpecForge Designer
**Design session:** `design-change-session:ba5c8d00-ad33-46cc-befd-1f93dcb0a5c2`
**ADR:** `adr-cross-scope-integration-contracts` (ADR-0039)
**Related:** `2026-08-26-evidence-driven-requirement-assessment-design.md` (complementary; its Phase 2 contract observations may consume these attestation states)

## Goal

Close the smallest possible slice of the intent-versus-reality gap for integration contracts: an authorized observer can record what was actually observed about a call, and the bounded atlas derives and displays a per-contract verification state. Scanners, continuous connectors, and automated drift detection remain deferred backlog facts.

## Design

1. **Ontology extension (additive).** `VALIDATES` allowed target types gain `integration` beside `adr`. Evidence may now validate a contract through the existing typed-link boundary; no new relation code, no schema migration.
2. **Attestation as evidence assets.** An observation is an ordinary `Evidence` asset authored in the consumer scope via MCP: `decisionId` anchors to `adr-cross-scope-integration-contracts`, `command` records the exact observation method, `result` records observed protocol/locator plus drift notes verbatim, `status` is `passed` (observed state matches the authored locator) / `failed` (material mismatch) / `blocked` (observation impossible), `recordedAt` orders freshness. No IntegrationContract fields are added; contracts stay clean.
3. **Canonical attestation ledger.** An evidence `VALIDATES` link is dual-written through the existing MCP boundary into the canonical `RelationshipEvent` / `RelationshipCurrent` ledger; `AssetLink` remains the compatibility projection. A bounded backfill repairs eligible legacy links only in the exact owning Scope and is idempotent.
4. **Verification-state derivation.** The bounded atlas reads active canonical `RelationshipCurrent` rows inside readable scopes, loads linked evidence payloads with the same composite identity (`enterpriseId`, application service, `scopePath`, logical ID), and derives per-contract `verificationState`: `ATTESTED` (latest evidence passed), `DRIFT` (latest failed), `BLOCKED_ATTESTATION` (latest blocked), `UNATTESTED` (no evidence). Latest wins by parsed `recordedAt`; ties break by asset id. Reads occur in one PostgreSQL `REPEATABLE READ` snapshot.
5. **Cursor consistency.** A continuation cursor binds the readable Scope digest and a sorted per-Scope vector of authored-catalog and relationship-event versions. Any authored asset or relationship change in a readable Scope invalidates the continuation.
6. **Surface.** Outbound/inbound rows and the atlas drawer show the state badge; coverage chips add attested and drift counters. Absence of evidence renders as explicit UNATTESTED, never as hidden.
7. **First-day honesty.** The legacy `integration-specforge-mcp-agent` record receives one real attestation backed by this session's receipts (the stdio JSON-RPC handshake performed by `pnpm design:query`); it stays target-UNRESOLVED while becoming protocol-ATTESTED. No other observation is fabricated.

## Non-Goals

Automated observation scheduling, provider-side acknowledgement, reconciliation between two sides, drift alerting, and requirement-assessment integration all remain separate deferred work.

## Acceptance Criteria

- A contract without evidence displays UNATTESTED explicitly on every surface.
- The latest evidence by recordedAt decides the state; older passing evidence cannot mask newer drift.
- Evidence for a contract outside readable scopes contributes nothing and errors nothing.
- `link_assets VALIDATES evidence -> integration` succeeds after the ontology extension and fails closed for unauthorized scopes.
- All human-facing labels ship English canonical plus Chinese overlay.
- The exact-Scope backfill is dry-run safe, bounded, and reports parity before apply.

# 集成契约验证状态设计

**状态：** 已实现并同步至精确 Designer Scope；扫描调度、提供方确认、双向对账、漂移告警和外部 APPLY 仍延期
**范围：** `com.huawei.celon.desiner`
**负责人：** SpecForge Designer
**设计会话：** `design-change-session:ba5c8d00-ad33-46cc-befd-1f93dcb0a5c2`
**相关：** 证据驱动需求评估设计（互补；其 Phase 2 契约观测可消费本设计的验证状态）

## 目标

为集成契约闭合"意图 vs 现实"缺口的最小切片：授权观察者可以记录实际观察到的调用事实，有界图谱据此推导并展示逐契约验证状态。扫描器、持续连接器与自动漂移检测仍为延期待办。

## 设计

1. **本体加法式扩展。** `VALIDATES` 允许目标类型在 `adr` 之外增加 `integration`。证据经既有类型化链接边界即可验证契约；不新增关系编码，不做模式迁移。
2. **证明即证据资产。** 一次观察就是消费方 Scope 内经 MCP 编写的普通 `Evidence` 资产：`decisionId` 锚定 ADR-0039，`command` 记录精确观察方法，`result` 原样记录观察到的协议/定位器与漂移说明，`status` 取 passed（观察与已编写定位器一致）/ failed（实质不一致）/ blocked（无法观察），`recordedAt` 决定新鲜度。IntegrationContract 不加字段，保持干净。
3. **规范证明关系账本。** evidence —VALIDATES→ integration 通过既有 MCP 边界双写到规范 `RelationshipEvent` / `RelationshipCurrent` 账本；`AssetLink` 保留为兼容投影。定向回填只处理精确 Scope 且可幂等重跑。
4. **验证状态推导。** 有界图谱在可读 Scope 内读取 active 规范关系，使用 `enterpriseId`、应用服务、`scopePath` 和逻辑 ID 复合身份加载证据，按解析后的 `recordedAt` 最新者推导状态；读取在 PostgreSQL `REPEATABLE READ` 快照内完成。
5. **游标一致性。** continuation 游标绑定可读 Scope 摘要及按 Scope 排序的 authored-catalog / relationship-event 版本向量；任一可读 Scope 的资产或关系变化都会使游标失效。
6. **界面呈现。** 出向/入向行与图谱抽屉显示状态徽标；覆盖芯片新增已证明与漂移计数。无证据显式渲染 UNATTESTED，绝不隐藏。
7. **首日诚实。** 存量 `integration-specforge-mcp-agent` 获得一条真实证明——依据本会话回执（`pnpm design:query` 实际完成的 stdio JSON-RPC 握手）；目标解析保持 UNRESOLVED，协议层面为 ATTESTED。不编造任何其他观察。

## 非目标

自动化观察调度、提供方确认、双边对账、漂移告警、需求评估集成均为独立延期工作。

## 验收标准

- 无证据的契约在所有界面显式显示 UNATTESTED。
- 按 recordedAt 最新的证据决定状态；旧的通过证据不能掩盖新的漂移。
- 可读 Scope 之外的证据既不参与也不报错。
- 本体扩展后 `link_assets VALIDATES evidence -> integration` 成功；未授权 Scope 下失败关闭。
- 所有面向人的标签提供英文规范与中文覆盖。
