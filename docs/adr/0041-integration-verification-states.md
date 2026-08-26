# ADR-0041: Integration Contract Verification States From Attestation Evidence

## Status

Accepted and implemented under exact-scope design-change-session `design-change-session:ba5c8d00-ad33-46cc-befd-1f93dcb0a5c2` in the Designer Scope. Spec: `docs/superpowers/specs/2026-08-26-integration-contract-verification-states-design.md`. Scanners, continuous connectors, automated scheduling, provider-side acknowledgement, and reconciliation remain deferred backlog facts.

已接受并实现，对应精确 Scope 设计变更会话 `design-change-session:ba5c8d00-ad33-46cc-befd-1f93dcb0a5c2`（Designer Scope）。规格见 `docs/superpowers/specs/2026-08-26-integration-contract-verification-states-design.md`。扫描器、持续连接器、自动调度、提供方确认与对账仍为延期待办。

## Context

ADR-0039 delivered governed cross-scope integration contracts and a bounded atlas, but nothing recorded what was actually observed about a call: every surface showed contracts without any reality signal, and absence of evidence was indistinguishable from absence of interest. The repo already had an `Evidence` asset type (ADR-oriented) and a `VALIDATES` relationship restricted to evidence→adr, so observations about contracts had no home and no path into the atlas.

ADR-0039 交付了受治理的跨应用集成契约与有界图谱，但没有任何东西记录调用实际被观察到的事实：所有界面只显示契约而无现实信号，证据缺席与无人关注无法区分。仓库已有面向 ADR 的 `Evidence` 资产类型，且 `VALIDATES` 关系仅限 evidence→adr，因此关于契约的观察既无归宿也无法进入图谱。

## Decision

1. **Additive ontology extension.** `VALIDATES` allowed target types gain `integration`; evidence may validate a contract through the existing typed-link boundary. No new relation code and no schema migration.
2. **Attestation is ordinary evidence.** An observation is an `Evidence` asset authored by the consumer scope through MCP (`decisionId` anchored to ADR-0039, `command` = exact observation method, `result` = observed protocol/locator plus verbatim drift notes, `status` passed/failed/blocked, `recordedAt` freshness). Contracts gain no fields.
3. **Canonical attestation ledger.** An evidence `VALIDATES` link is dual-written through the existing MCP boundary into canonical `RelationshipEvent` and `RelationshipCurrent` rows; `AssetLink` remains a compatibility projection. The exact-Scope backfill is bounded, dry-run safe, idempotent, and parity checked.
4. **Derived states, latest wins.** The atlas reads active canonical `RelationshipCurrent` rows, loads linked evidence using the composite identity `(enterpriseId, applicationServiceId, scopePath, logicalId)`, and derives per-contract `verificationState`: ATTESTED / DRIFT / BLOCKED_ATTESTATION / UNATTESTED, decided by parsed newest `recordedAt` (ties break by asset id). The read is one PostgreSQL `REPEATABLE READ` snapshot.
5. **Cursor consistency.** Continuations bind a readable-Scope digest and sorted per-Scope authored-catalog plus relationship-event version vector; any change in a readable Scope invalidates the cursor.
6. **Explicit everywhere.** Rows, drawer, and coverage chips show the state; no evidence renders as explicit UNATTESTED rather than hidden.
7. **First attestation is real.** The legacy `integration-specforge-mcp-agent` record receives one evidence-backed attestation from this session's receipts (live stdio JSON-RPC performed by `pnpm design:query`). It remains target-UNRESOLVED while becoming protocol-ATTESTED. Nothing else is observed or fabricated.

## Alternatives

- **New AttestationRecord asset type**: rejected — Evidence plus a typed link carries all needed facts without a schema migration or a second authoring path.
- **Embedding observations on the contract**: rejected — it couples intent with observations inside one mutable payload and breaks single-authorship clarity.
- **Centralized gateway observation or file-only records**: rejected — the former breaks consumer ownership and the latter is not queryable.

## Consequences

- The integrations surface becomes a truthfulness dashboard: UNATTESTED is visible work-in-progress, DRIFT is an actionable finding, and attestation requires only an authorized observer with an exact command receipt.
- Rule authors of future automation must respect that states are derived, never stored on contracts; deleting evidence changes derived state deterministically.
- Requirement-assessment Phase 2 (contract/schema observations) can consume these attestations instead of inventing its own.

## Constraints

- Reads stay within readable scopes; derivation respects the bounded atlas budgets and composite cursor waterline.
- No new asset type, Prisma migration, or write boundary: evidence authoring still flows exclusively through MCP upserts, which project canonical VALIDATES relationships.
- English canonical fields and complete Chinese overlays are required on the evidence assets and all new UI labels.

## Operational Boundary

- **MCP synchronization blocked (full baseline only):** a full `pnpm design-facts:sync` attempt reached the historical `adr-agent-driven-legacy-baseline-discovery` record and was rejected with `DATA_MODEL_UPGRADE_REQUIRED`. The selected `adr-integration-verification-states` synchronization and read-back succeeded, so this increment is synchronized; the unrelated historical baseline remains blocked.
- **Owner:** SpecForge Architecture.
- **Retry trigger:** upgrade or separately migrate the historical data-model assets through their governed MCP change-set, then rerun full `pnpm design-facts:sync`, `pnpm design-facts:check`, and the exact-Scope federation check.

## Evidence

- `pnpm design-context:preflight -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --intent "Repair cross-Scope integration verification consistency" --affected "adr-integration-verification-states,adr-cross-scope-integration-contracts,api-specforge-mcp-tools,data-specforge-assets" --evidence "adr-0041-design-review"` → session `design-change-session:ba5c8d00-ad33-46cc-befd-1f93dcb0a5c2`, digest `cc9337c35345e5e1d164e0dc73edd9ff62a931ec40309f5f0aa3b28bf5c84129`.
- Ontology and persistence: `pnpm --filter @specforge/mcp-server exec vitest run src/persistence.test.ts src/relationships/command-service.test.ts` → **45 tests passed**, including canonical evidence VALIDATES projection and authorization behavior.
- Backfill: `pnpm integration-attestations:backfill -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --mode dry-run` → scanned 551, eligible 1, failed 0; no apply was needed.
- Atlas: `pnpm exec vitest run apps/web/lib/integrations/atlas.test.ts apps/web/components/integration-atlas-canvas.test.ts --exclude .worktrees/** --exclude .pnpm-store/**` → **2 files, 11 tests passed**, including cross-Scope identity, catalog/relationship cursor invalidation, timestamp ordering, and bilingual labels.
- MCP writes (exact desiner scope): `adr-integration-verification-states` registered; first attestation evidence `evidence-integration-specforge-mcp-agent-20260826` uploaded; typed link `evidence —VALIDATES→ integration-specforge-mcp-agent` accepted; Proposal 18 specChanges / Context Pack 54 instructions (marker "integration verification states increment").
- `pnpm --filter @specforge/web typecheck` exit 0.
- Deployment verification (CDP, http://127.0.0.1:3010/assets/integrations?scope=com.huawei.celon.desiner): chips `Attested: 1 / Drift: 0`, contract row shows badge **Attested** with `Target resolution: UNRESOLVED` — protocol attested, target unresolved exactly as designed.
- Operational repair recorded during verification: the deployed web stack read bundled database `specforge` while the single authoritative MCP database is `specforge_canonical` on the same server (347 vs 312 assets; graph overlay already documented canonical). Fixed by aligning `POSTGRES_DB=specforge_canonical` in deploy/.env and force-recreating web/connector-worker/knowledge-projector. This restores the single-authoritative-postgres design; no schema or data was migrated or duplicated.
- `$env:SPECFORGE_DESIGN_FACT_IDS='adr-integration-verification-states'; pnpm design-facts:sync` → exact ADR synchronization returned `complete`.
- `$env:SPECFORGE_DESIGN_FACT_IDS='adr-integration-verification-states'; pnpm design-facts:check` → `missing=[]`, `mismatched=[]`, `outOfScope=[]`, `blocked=[]`.
- `pnpm design-facts:relations:check` → 54 legacy relationships with no unregistered or ambiguous relation codes.
- `$env:SPECFORGE_APPLICATION_SERVICE_ID='com.huawei.celon.desiner'; $env:SPECFORGE_SCOPE_PATH='pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner'; pnpm design-facts:federation:check` → `blocking=false`.
- `pnpm design-facts:sync` (full baseline) → **MCP synchronization blocked** for the unrelated `adr-agent-driven-legacy-baseline-discovery` at `DATA_MODEL_UPGRADE_REQUIRED`; owner and retry trigger are recorded above, and full synchronization is not claimed complete.

## MCP Record

- MCP ADR ID: `adr-integration-verification-states`
- Owning architectureScope: `com.huawei.celon.desiner`
- Related records: ADR-0039, spec `2026-08-26-integration-contract-verification-states-design.md`, first attestation evidence `evidence-integration-specforge-mcp-agent-20260826` with typed link VALIDATES → `integration-specforge-mcp-agent`, Proposal `proposal-integration-contract-verification-states`, Context Pack `context-pack-integration-contract-verification-states`.

## 集成契约验证状态：来自证明证据的推导

**状态：** 已接受并实现（会话 `ba5c8d00-ad33-46cc-befd-1f93dcb0a5c2`，Designer Scope）

### 背景

ADR-0039 之后没有任何东西记录调用的实际观察；证据缺席与无人关注无法区分；Evidence 类型和 VALIDATES 关系都不通向契约。

### 决策

VALIDATES 目标加法式扩展至 integration；观察以普通证据资产经 MCP 编写（command/result/status/recordedAt）；图谱按最新 recordedAt 推导每契约 ATTESTED/DRIFT/BLOCKED_ATTESTATION/UNATTESTED 并在各界面显式呈现；首条证明来自本会话真实的 stdio JSON-RPC 回执，其余一律不编造。

### 备选方案

- 新建证明资产类型：否决，无需迁移。
- 观察嵌入契约：否决，意图与观察耦合。
- 网关集中观察或仅存文件：否决，分别破坏消费方归属或不可查询。

### 后果

- 界面成为真实性仪表盘，UNATTESTED 是显式待办而不是隐藏状态。
- 状态是推导的而非存储，删除证据会确定性地改变结果。
- 需求评估 Phase 2 可以直接消费这些证明，不必另建观测模型。

### 约束

- 读取限于可读 Scope，并遵守预算与游标。
- 不新增资产类型、Schema 迁移或写边界，证据仍只能经 MCP upsert。
- 所有面向人的内容必须提供英文规范字段和完整中文覆盖。

### 运行边界

- **MCP 同步受阻（仅全量基线）：** 全量 `pnpm design-facts:sync` 执行到历史 `adr-agent-driven-legacy-baseline-discovery` 时，被 `DATA_MODEL_UPGRADE_REQUIRED` 拒绝。本增量对应的 `adr-integration-verification-states` 精确同步与回读已成功，因此本增量已同步；无关的历史基线仍受阻。
- **负责人：** SpecForge Architecture。
- **重试触发：** 先通过受治理 MCP change-set 升级或单独迁移历史数据模型资产，再重新运行全量 `pnpm design-facts:sync`、`pnpm design-facts:check` 和精确 Scope 联邦检查。

### 证据

- `pnpm exec vitest run apps/web/lib/integrations/atlas.test.ts apps/web/components/integration-atlas-canvas.test.ts --exclude .worktrees/** --exclude .pnpm-store/**`：2 个文件、11 项测试通过，覆盖跨 Scope 身份、目录/关系水位失效、时间排序和双语标签。
- `pnpm --filter @specforge/web typecheck`：通过。
- `pnpm integration-attestations:backfill -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --mode dry-run`：扫描 551 条，符合 1 条，失败 0 条；无需 apply。
- `docker compose --env-file deploy/.env -f deploy/compose.yaml ps web postgres` 与 `Invoke-WebRequest http://127.0.0.1:3010/healthz`：容器健康，Web 健康端点返回 HTTP 200。
- `$env:SPECFORGE_DESIGN_FACT_IDS='adr-integration-verification-states'; pnpm design-facts:sync`：精确 ADR 同步回执为 `complete`。
- `$env:SPECFORGE_DESIGN_FACT_IDS='adr-integration-verification-states'; pnpm design-facts:check`：`missing=[]`、`mismatched=[]`、`outOfScope=[]`、`blocked=[]`。
- `pnpm design-facts:relations:check`：54 条遗留关系无未注册或歧义关系。
- `$env:SPECFORGE_APPLICATION_SERVICE_ID='com.huawei.celon.desiner'; $env:SPECFORGE_SCOPE_PATH='pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner'; pnpm design-facts:federation:check`：`blocking=false`。
- `pnpm design-facts:sync`（全量）：**MCP 同步受阻**，历史 `adr-agent-driven-legacy-baseline-discovery` 返回 `DATA_MODEL_UPGRADE_REQUIRED`；负责人和重试触发已记录，未将全量同步声明为完成。

### MCP 记录

`adr-integration-verification-states`，Designer Scope；关联 ADR-0039、首条证据及其 VALIDATES 链接、独立 Proposal `proposal-integration-contract-verification-states` 和 Context Pack `context-pack-integration-contract-verification-states`。
