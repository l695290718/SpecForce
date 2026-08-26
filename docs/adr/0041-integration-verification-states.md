# ADR-0041: Integration Contract Verification States From Attestation Evidence

## Status

Accepted and implemented under exact-scope design-change-session `design-change-session:89ee66e7-8e43-4638-9704-e15f7ab1546b` in the Designer Scope. Spec: `docs/superpowers/specs/2026-08-26-integration-contract-verification-states-design.md`. Scanners, continuous connectors, automated scheduling, provider-side acknowledgement, and reconciliation remain deferred backlog facts.

已接受并实现，对应精确 Scope 设计变更会话 `design-change-session:89ee66e7-8e43-4638-9704-e15f7ab1546b`（Designer Scope）。规格见 `docs/superpowers/specs/2026-08-26-integration-contract-verification-states-design.md`。扫描器、持续连接器、自动调度、提供方确认与对账仍为延期待办。

## Context

ADR-0039 delivered governed cross-scope integration contracts and a bounded atlas, but nothing recorded what was actually observed about a call: every surface showed contracts without any reality signal, and absence of evidence was indistinguishable from absence of interest. The repo already had an `Evidence` asset type (ADR-oriented) and a `VALIDATES` relationship restricted to evidence→adr, so observations about contracts had no home and no path into the atlas.

ADR-0039 交付了受治理的跨应用集成契约与有界图谱，但没有任何东西记录调用实际被观察到的事实：所有界面只显示契约而无现实信号，证据缺席与无人关注无法区分。仓库已有面向 ADR 的 `Evidence` 资产类型，且 `VALIDATES` 关系仅限 evidence→adr，因此关于契约的观察既无归宿也无法进入图谱。

## Decision

1. **Additive ontology extension.** `VALIDATES` allowed target types gain `integration`; evidence may validate a contract through the existing typed-link boundary. No new relation code and no schema migration.
2. **Attestation is ordinary evidence.** An observation is an `Evidence` asset authored by the consumer scope through MCP (`decisionId` anchored to ADR-0039, `command` = exact observation method, `result` = observed protocol/locator plus verbatim drift notes, `status` passed/failed/blocked, `recordedAt` freshness). Contracts gain no fields.
3. **Derived states, latest wins.** The atlas joins readable-scope `AssetLink` rows (evidence —VALIDATES→ integration), loads linked evidence, and derives per-contract `verificationState`: ATTESTED / DRIFT / BLOCKED_ATTESTATION / UNATTESTED, decided by newest `recordedAt` (ties break by asset id). Derivation stays inside existing scope/budget/cursor bounds.
4. **Explicit everywhere.** Rows, drawer, and coverage chips show the state; no evidence renders as explicit UNATTESTED rather than hidden.
5. **First attestation is real.** The legacy `integration-specforge-mcp-agent` record receives one evidence-backed attestation from this session's receipts (live stdio JSON-RPC performed by `pnpm design:query`). It remains target-UNRESOLVED while becoming protocol-ATTESTED. Nothing else is observed or fabricated.

1. **本体加法式扩展。** `VALIDATES` 允许目标类型增加 `integration`；证据经既有类型化链接边界验证契约。不新增关系编码，不做模式迁移。
2. **证明即普通证据。** 观察是消费方 Scope 经 MCP 编写的 `Evidence` 资产（decisionId 锚定 ADR-0039、command 记录精确观察方法、result 原样记录观察到的协议/定位器与漂移说明、status 取 passed/failed/blocked、recordedAt 决定新鲜度）。契约不加字段。
3. **推导状态，最新为准。** 图谱联接可读 Scope 内 evidence—VALIDATES→integration 的 AssetLink 与证据载荷，按最新 recordedAt 推导每契约 ATTESTED / DRIFT / BLOCKED_ATTESTATION / UNATTESTED（平局按资产 id），推导遵守既有 Scope/预算/游标边界。
4. **处处显式。** 行、抽屉、覆盖芯片均展示状态；无证据显式渲染 UNATTESTED 而非隐藏。
5. **首条证明真实。** 存量 `integration-specforge-mcp-agent` 依据本会话回执（`pnpm design:query` 实际执行的 stdio JSON-RPC）获得一条证据支撑的证明：目标解析仍为 UNRESOLVED，协议层面为 ATTESTED。此外不观察、不编造任何事实。

## Alternatives

- **New AttestationRecord asset type**: rejected — Evidence plus a typed link carries all needed facts without a schema migration or a second authoring path.
- **Embedding observations on the contract**: rejected — it couples intent with observations inside one mutable payload and breaks single-authorship clarity.

- **新建 AttestationRecord 资产类型**：否决——Evidence 加类型化链接即可承载全部事实，避免模式迁移与第二条编写路径。
- **把观察嵌入契约字段**：否决——意图与观察耦合进同一可变负载，破坏单作者清晰性。

## Consequences

- The integrations surface becomes a truthfulness dashboard: UNATTESTED is visible work-in-progress, DRIFT is an actionable finding, and attestation requires only an authorized observer with an exact command receipt.
- Rule authors of future automation must respect that states are derived, never stored on contracts; deleting evidence changes derived state deterministically.
- Requirement-assessment Phase 2 (contract/schema observations) can consume these attestations instead of inventing its own.

- 集成界面成为真实性仪表盘：UNATTESTED 是可见的待办工作，DRIFT 是可行动发现，而证明只需一位持有精确命令回执的授权观察者。
- 未来自动化的实现者必须遵守：状态是推导的，绝不存储在契约上；删除证据会确定性地改变推导结果。
- 需求评估 Phase 2（契约观测）可以直接消费这些证明，而不必另起炉灶。

## Constraints

- Reads stay within readable scopes; derivation respects the bounded atlas budgets and cursor waterline.
- No new asset type, Prisma migration, or write boundary: evidence authoring still flows exclusively through MCP upserts.
- English canonical fields and complete Chinese overlays are required on the evidence assets and all new UI labels.

- 读取限于可读 Scope；推导遵守图谱预算与游标水位。
- 不新增资产类型、Prisma 迁移或写边界：证据编写仍只能经 MCP upsert。
- 证据资产与全部新界面标签必须提供英文规范字段与完整中文覆盖。

## Alternatives Considered (zh)

- **网关集中登记观察**：否决——观察属于消费方事实，集中化破坏 ADR-0039 的归属模型。
- **仅存文件不进系统记录**：否决——不可查询的证据等于没有证据。

## Evidence

- `pnpm design-context:preflight --intent "Verification loop minimal slice: ..."` → session `design-change-session:89ee66e7-8e43-4638-9704-e15f7ab1546b` opened before implementation.
- Ontology: additive VALIDATES extension compiled; `apps/web` vitest `lib/integrations` → **Tests 8 passed (8)** including ATTESTED derivation, drift masking (newer failed evidence beats older pass), and explicit UNATTESTED.
- MCP writes (exact desiner scope): `adr-integration-verification-states` registered; first attestation evidence `evidence-integration-specforge-mcp-agent-20260826` uploaded; typed link `evidence —VALIDATES→ integration-specforge-mcp-agent` accepted; Proposal 18 specChanges / Context Pack 54 instructions (marker "integration verification states increment").
- `pnpm exec tsc --noEmit -p apps/web` exit 0; `pnpm --filter @specforge/web build` compiled successfully.
- Deployment verification (CDP, http://127.0.0.1:3010/assets/integrations?scope=com.huawei.celon.desiner): chips `Attested: 1 / Drift: 0`, contract row shows badge **Attested** with `Target resolution: UNRESOLVED` — protocol attested, target unresolved exactly as designed.
- Operational repair recorded during verification: the deployed web stack read bundled database `specforge` while the single authoritative MCP database is `specforge_canonical` on the same server (347 vs 312 assets; graph overlay already documented canonical). Fixed by aligning `POSTGRES_DB=specforge_canonical` in deploy/.env and force-recreating web/connector-worker/knowledge-projector. This restores the single-authoritative-postgres design; no schema or data was migrated or duplicated.

## MCP Record

- MCP ADR ID: `adr-integration-verification-states`
- Owning architectureScope: `com.huawei.celon.desiner`
- Related records: ADR-0039, spec `2026-08-26-integration-contract-verification-states-design.md`, first attestation evidence `evidence-integration-specforge-mcp-agent-20260826` with typed link VALIDATES → `integration-specforge-mcp-agent`, Proposal `proposal-specforge-self-design`, Context Pack `ctx-specforge-self-design`.

# 集成契约验证状态：来自证明证据的推导

**状态：** 已接受并实现（会话 `89ee66e7`，Designer Scope）

**背景：** ADR-0039 之后没有任何东西记录调用的实际观察；证据缺席与无人关注无法区分；Evidence 类型和 VALIDATES 关系都不通向契约。

**决策：** VALIDATES 目标加法式扩展至 integration；观察以普通证据资产经 MCP 编写（command/result/status/recordedAt）；图谱按最新 recordedAt 推导每契约 ATTESTED/DRIFT/BLOCKED_ATTESTATION/UNATTESTED 并在各界面显式呈现；首条证明来自本会话真实的 stdio JSON-RPC 回执，其余一律不编造。

**备选：** 新建证明资产类型（否决——无需迁移）；观察嵌入契约（否决——意图与观察耦合）。网关集中观察（否决）、仅存文件（否决）。

**后果与约束：** 界面成为真实性仪表盘；状态是推导的而非存储；读取限于可读 Scope 并遵守预算游标；无新模式或新写边界；双语覆盖完整。

**MCP 记录：** `adr-integration-verification-states`，Designer Scope；关联 ADR-0039、验证切片规格、首条证据及其 VALIDATES 链接、Proposal 与 Context Pack 条目。
