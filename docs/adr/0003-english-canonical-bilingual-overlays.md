# ADR 0003: English Canonical, Bilingual Overlays

## Status

**Implemented:** Human-facing design assets preserve English canonical fields and provide Chinese localized overlays at the MCP and derived-view boundaries.

**Local-verified:** Focused bilingual and localized-view tests exist and prior implementation commits record this behavior; fresh execution in this worktree is blocked because the `vitest` binary is unavailable.

**Deferred:** Translation workflow automation, locale completeness beyond English and Chinese, and production MCP read-back for this ADR are deferred.

**Stable ID:** `adr-canonical-english-localized-overlay`

**Owning architectureScope:** `com.huawei.celon.desiner` with scope path `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.

**中文本地化覆盖：**

**已实现：** 面向人的设计资产保留英文规范字段，并在 MCP 和派生视图边界提供中文本地化覆盖。

**本地验证状态：** 聚焦双语和本地化视图测试已存在，之前的实现提交记录了这些行为；当前工作区无法运行 `vitest`，因此未完成新鲜执行。

**延期：** 翻译工作流自动化、英中之外的语言完整性以及本 ADR 的生产 MCP 回读延期。

**稳定 ID：** `adr-canonical-english-localized-overlay`

**所属 architectureScope：** `com.huawei.celon.desiner`，范围路径为 `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`。

## Context

Agents and integrations need stable English keys and predictable semantics, while people in the owning Huawei service need Chinese-readable decision content. A single translated field would make canonical comparisons unstable; English-only records would make human review incomplete.

**中文本地化覆盖：**

代理和集成需要稳定的英文键及可预测语义，而所属华为服务中的人员需要可读的中文决策内容。只保存一个翻译字段会使规范比较不稳定；只有英文记录又会使人工评审不完整。

## Decision

English is canonical for titles, context, decisions, asset identity, and machine-facing comparisons. Chinese is a complete localized overlay for all human-facing decision content, not a shortened summary. Read paths select a locale without mutating canonical content; writes reject missing or incomplete required overlays.

**中文本地化覆盖：**

标题、背景、决策、资产身份和机器比较以英文为规范内容。中文是所有面向人的决策内容的完整本地化覆盖，而不是缩写摘要。读取路径按语言选择内容但不修改规范内容；写入路径拒绝缺失或不完整的必需覆盖。

## Alternatives

1. **English-only authoring and UI.** Rejected because it fails the human review requirement for this service.
2. **Chinese as the canonical source.** Rejected because integrations and stable asset comparisons use English identifiers and semantics.
3. **Store only translated summaries.** Rejected because summaries can omit constraints, alternatives, evidence, or tradeoffs.

**中文本地化覆盖：**

1. **仅使用英文编写和界面。** 拒绝，因为无法满足本服务的人类评审要求。
2. **以中文作为规范来源。** 拒绝，因为集成和稳定资产比较使用英文标识与语义。
3. **只存储翻译摘要。** 拒绝，因为摘要可能遗漏约束、替代方案、证据或权衡。

## Consequences

Canonical comparisons, synchronization, and agent consumption remain deterministic. Authors must maintain two complete language representations, validation and storage payloads become larger, and localization drift must be detected. A missing overlay blocks the authored fact from being complete.

**中文本地化覆盖：**

规范比较、同步和代理消费保持确定性。编写者必须维护两套完整语言表示，校验和存储载荷会增大，并且必须检测本地化漂移。缺少覆盖内容会阻止设计事实被标记为完成。

## Constraints

- Scope is exactly `com.huawei.celon.desiner` and its exact materialized scope path.
- English canonical fields must remain available even when a Chinese read is requested.
- Chinese overlays must cover every required human-facing field in the ADR or asset payload.
- Existing legacy records without overlays may be read only through an explicitly documented compatibility path; new writes must be complete.

**中文本地化覆盖：**

- 范围严格是 `com.huawei.celon.desiner` 及其精确物化范围路径。
- 即使请求中文读取，英文规范字段仍必须可用。
- 中文覆盖必须覆盖 ADR 或资产载荷中所有必需的面向人字段。
- 没有覆盖的旧记录只能通过明确记录的兼容路径读取；新写入必须完整。

## Evidence

- `pnpm exec vitest run packages/core/src/__tests__/bilingual-assets.test.ts`: blocked before test startup because the referenced test file is absent and `vitest` is unavailable in this worktree.
- `pnpm exec vitest run apps/web/lib/__tests__/assets-scope.test.ts`: blocked before test startup because `vitest` is unavailable in this worktree.
- `rg -n "localized|locale|canonical|bilingual" apps/mcp-server/src packages/core/src apps/web/lib`: local inspection of canonical/overlay handling.

**中文本地化覆盖：**

- `pnpm exec vitest run packages/core/src/__tests__/bilingual-assets.test.ts`：因引用的测试文件不存在且当前工作区缺少 `vitest`，测试在启动前阻塞。
- `pnpm exec vitest run apps/web/lib/__tests__/assets-scope.test.ts`：因当前工作区缺少 `vitest`，测试在启动前阻塞。
- `rg -n "localized|locale|canonical|bilingual" apps/mcp-server/src packages/core/src apps/web/lib`：本地检查规范字段和覆盖内容的处理。

## MCP Record

- **MCP ADR ID:** `adr-canonical-english-localized-overlay` (existing stable ID supplied for this decision).
- **Scope:** `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- **Matching Proposal:** deferred; no stable Proposal ID was supplied or verified in this assignment.
- **Matching Context Pack:** deferred; no stable Context Pack ID was supplied or verified in this assignment.
- **Related assets and typed links:** bilingual asset payloads, localized derived views, and MCP validation; exact MCP link targets remain deferred until synchronization read-back.
- **Synchronization state:** `implemented; local verification blocked; production synchronization deferred`. Record **`MCP synchronization blocked`** on any failed attempt, including reason and retry trigger.

**中文本地化覆盖：**

- **MCP ADR ID：** `adr-canonical-english-localized-overlay`（本决策使用任务提供的现有稳定 ID）。
- **范围：** `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- **匹配 Proposal：** 延期；本任务未提供或验证稳定 Proposal ID。
- **匹配 Context Pack：** 延期；本任务未提供或验证稳定 Context Pack ID。
- **相关资产和类型化链接：** 双语资产载荷、本地化派生视图和 MCP 校验；精确 MCP 链接目标将在同步回读时补齐。
- **同步状态：** `implemented; local verification blocked; production synchronization deferred`。任何失败尝试都必须记录 **`MCP synchronization blocked`**、失败原因和重试触发条件。
