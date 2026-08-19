# Asset-to-3A Mapping Semantics Design

## Status

- Concept approved by the product owner on 2026-08-19.
- This document defines the implementation boundary; code and data migration have not started.
- Owning application service: `com.huawei.celon.desiner`.
- Owning Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- Design Change Session: `design-change-session:8341f602-0627-463b-9aae-1636fcfe8e94`.
- English is canonical. Chinese is the complete human-facing localization.

## Problem

The current 3A model uses the word "mapping" for two different concepts:

1. `ArchitectureUnitMembership` assigns a design asset to a BIZ, SYS, or TECH architecture unit.
2. `ArchitectureUnitMapping` connects one architecture unit to another across layers, such as BIZ-to-SYS or SYS-to-TECH.

The product meaning of "3A mapping" is the first concept: a user starts from a design asset and needs to know where that asset belongs in 3A, why it belongs there, and whether the result is directly authored or derived through evidence. The second concept remains useful, but it is an architecture realization relationship and must not compete for the same name.

The published Designer v6 Baseline currently contains 8 architecture units, 42 direct memberships, and 6 cross-layer unit relationships. The enterprise coverage generation contains 303 covered design records. Forty-two records are directly assigned by governed membership revisions; the remaining covered records reach a unit through bounded typed-relationship evidence. Reporting only the six unit relationships as "3A mappings" therefore presents the wrong primary model.

## Goals

- Make design-asset-to-3A-unit mapping the primary product and MCP concept.
- Distinguish governed direct assignment from derived trace coverage.
- Rename unit-to-unit cross-layer mappings to architecture realization relationships in public contracts and UI copy.
- Preserve the immutable v6 Baseline, existing stable identities, historical projections, and PostgreSQL authority.
- Expose all scoped authored assets through a bounded, explainable mapping result without promoting inferred paths into canonical assignments.
- Use the corrected mapping model as the evidence source for later v7 structural-unit expansion.

## Non-Goals

- Publishing new v7 architecture units in this increment.
- Reclassifying any of the 42 accepted v6 direct memberships.
- Converting a trace path into a direct assignment automatically.
- Deleting or renaming persisted v6 revision identities.
- Treating file paths, names, graph communities, or source-code proximity as architecture authority.
- Adding cross-Scope aggregation or weakening exact application-service authorization.

## Considered Approaches

### 1. Rename only the page labels

Keep the contracts unchanged and change "mapping" to "realization" in visible text. This is insufficient because MCP clients and exported Context Packs would continue to expose ambiguous field names.

### 2. Replace memberships and unit mappings with one generic edge table

Store asset assignment and cross-layer realization as generic graph edges. This is rejected because the two concepts have different authority, lifecycle, validation, and cardinality rules. A generic edge would also weaken PostgreSQL constraints and make direct assignment indistinguishable from derived evidence.

### 3. Add a unified asset mapping read model and compatibility aliases

Keep canonical membership revisions and existing projections intact. Build an additive asset-to-3A mapping read model from accepted direct memberships and the current coverage generation. Rename unit-to-unit relationships at the public contract and UI level while retaining deprecated compatibility fields for existing clients. This is the selected approach because it corrects the product model without rewriting historical Baselines.

## Canonical Terminology

| Concept | Canonical English | Chinese | Meaning |
| --- | --- | --- | --- |
| Asset to unit | Asset-to-3A mapping | 设计资产到 3A 映射 | Explains where one design asset belongs in BIZ, SYS, or TECH. |
| Authored placement | Direct assignment | 直接归属 | A reviewed `ArchitectureUnitMembershipRevision` explicitly assigns the asset to a unit. |
| Derived placement | Trace mapping | 追溯映射 | A bounded typed-relationship path reaches a directly assigned asset and its unit. |
| Unit to unit | Architecture realization | 架构实现关系 | Connects BIZ-to-SYS or SYS-to-TECH architecture units. |
| Asset to asset | Design-fact relationship | 设计事实关系 | The original typed relationship used by trace, impact analysis, and evidence. |

The term "3A mapping" without qualification always means asset-to-3A mapping. Unit-to-unit records must be described as realizations.

## Asset-to-3A Mapping Model

An `Asset3AMappingProjection` is an immutable, generation-bound read record. It does not replace the authored membership revision or coverage row; it gives MCP and Web clients one stable product model.

Each record contains:

- exact `applicationServiceId` and full `scopePath`;
- catalog revision, relationship version, Baseline ID, Profile identity, coverage generation, and projection generation;
- asset type, asset ID, semantic identity, and canonical/localized display content;
- mapping mode: `DIRECT`, `TRACE`, `EXEMPT`, or `BLOCKED`;
- target unit identity, layer, kind, and bilingual unit name when a target exists;
- authoritative membership revision ID for `DIRECT`;
- ordered relationship identities and bounded path nodes for `TRACE`;
- confidence, reason code, evidence references, content digest, and freshness state;
- explicit owner, rationale, and retry trigger for `EXEMPT` or `BLOCKED`.

### Authority Rules

- `DIRECT` is authoritative architecture placement because it is backed by an accepted membership revision in the published Baseline.
- `TRACE` is a derived explanation, not an authored placement. It must never create or mutate a membership revision.
- `EXEMPT` explains why a record intentionally has no structural placement.
- `BLOCKED` means the system cannot provide a trustworthy target. It must not fall back to a guessed unit.
- One asset has at most one primary mapping result in a mapping generation. Multiple candidate units make the record `BLOCKED` until governed review resolves the ambiguity.
- All evidence paths are deterministic, cycle-safe, Scope-safe, and bounded by the published coverage policy.

## Architecture Realization Model

The existing `ArchitectureUnitMappingRevision` and `ArchitectureUnitMappingProjection` semantics remain valid but are presented as `ArchitectureRealizationRevision` and `ArchitectureRealizationProjection` in new public contracts.

A realization:

- connects architecture units, never raw design assets;
- uses an allowed adjacent-layer family such as `CAPABILITY_TO_SERVICE` or `SERVICE_TO_TECHNOLOGY`;
- cites the typed design-fact relationships that justify the cross-layer claim;
- remains immutable and Baseline-bound;
- appears in the Architecture Map, not in the primary Asset Mapping list.

Persisted IDs such as `mapping:unit:biz:...->unit:sys:...` remain stable. Database tables and old response fields are not destructively renamed in the first compatibility phase.

## Read Model And Persistence

PostgreSQL remains authoritative for authored assets, membership revisions, realization revisions, relationship events, Baselines, and coverage generations. The new asset mapping projection is rebuildable from those sources.

The materializer reads one pinned input tuple:

```text
Scope + catalog revision + relationship version + Baseline
      + Profile version + coverage generation
```

It writes exactly one `Asset3AMappingProjection` row for every scoped catalog record in that generation. Publication fails if row count differs from the pinned catalog count, if any row crosses Scope, or if two primary rows exist for one asset. NebulaGraph is not authoritative and is not required to build this projection.

For the current Designer snapshot, acceptance expects 303 mapping rows, including 42 `DIRECT` rows and the remaining records represented by governed `TRACE`, `EXEMPT`, or `BLOCKED` outcomes. The exact mode totals must be calculated from the pinned generation during implementation rather than hard-coded beyond the known 42 direct assignments.

## MCP Contracts

Add read-only exact-Scope tools:

- `search_3a_asset_mappings`: bounded filtering by asset type, layer, unit, mode, status, and text; keyset continuation only.
- `get_3a_asset_mapping`: returns one asset's target, authority, evidence path, generation identity, and diagnostics.
- `search_3a_architecture_realizations`: exposes the existing unit-to-unit relationships under their corrected name.

Compatibility behavior:

- `search_3a_architecture_map` adds `realizations` as the canonical response field.
- Its existing `mappings` field remains as a deprecated alias for at least one compatibility cycle and returns the same unit-to-unit records.
- Existing architecture authoring tools keep accepting current persisted revision types during the compatibility phase.
- No new MCP write tool is needed for trace mappings because traces are projections. Direct assignment continues through the governed architecture-fact batch and review flow.

All tools fail closed before reading counts or records when the caller lacks the exact Scope grant.

## Web Experience

The 3A workspace separates three representations:

1. **Asset Mapping / 资产映射** is the primary mapping view. It lists design assets and their target BIZ/SYS/TECH unit, mode, reason, evidence, and freshness.
2. **Architecture Realization / 架构实现** shows the readable BIZ-to-SYS-to-TECH unit chain.
3. **Relationship Network / 关系网络** keeps detailed asset-to-asset topology and impact exploration.

Selecting an asset opens an explanation panel containing its bilingual content, target unit, direct membership or ordered trace path, evidence references, Baseline, generation, and review status. `TRACE` receives a distinct derived label; it must not visually imply the same authority as `DIRECT`.

Existing URLs and saved `architecture` views continue to open the realization map. The generic visible label "3A mapping" is removed from unit-to-unit screens and exports.

## v7 Structural Expansion Boundary

This semantic correction precedes v7. After the asset mapping projection is published, candidate structural units are selected from evidence, not raw record counts.

A v7 candidate must satisfy all of these conditions:

- multiple related assets currently converge on an overly broad unit or a blocked ambiguous target;
- a stable business, system, or technology responsibility can be stated in English and Chinese;
- the candidate has a source owner and direct typed evidence;
- splitting it improves realization completeness or removes material ambiguity;
- the change can be published as a complete immutable snapshot while preserving v6.

The first candidate review will explicitly evaluate connector execution, change attestation, graph projection, and derived graph runtime boundaries. Their existence in code is evidence input, not automatic approval.

## Failure Handling

- Missing pinned inputs, inconsistent digests, cross-Scope evidence, ambiguous target units, or incomplete bilingual unit content blocks publication.
- A stale coverage generation cannot silently produce a current mapping generation.
- Missing trace evidence produces `BLOCKED`, not `TRACE` with an empty path.
- A direct membership and a conflicting trace target produce `BLOCKED` diagnostics and preserve the direct canonical record for review; the projector does not rewrite authority.
- Partial pages report continuation and partial reasons. They never report global counts outside the caller's authorized Scope.
- MCP write or read-back failure records `MCP synchronization blocked`, owner, reason, and retry trigger, and prevents completion.

## Verification

- Contract tests distinguish asset mappings from architecture realizations and preserve deprecated response aliases.
- Persistence tests enforce one asset mapping per pinned generation and exact Scope.
- Materializer tests cover direct, trace, exempt, blocked, ambiguity, stale input, and deterministic replay.
- MCP tests cover authorization, filters, keyset continuation, payload budgets, and no cross-Scope count leakage.
- Web tests verify corrected labels, mode explanations, URL compatibility, empty/error states, and bilingual switching.
- Designer integration read-back verifies the current 8 units, 42 direct memberships, 6 realizations, and one mapping outcome for every pinned catalog record.
- v6 and v5 Baselines remain readable with unchanged identities and counts.

## Acceptance Criteria

- Public product language uses "3A mapping" only for design-asset-to-unit results.
- Every authorized scoped asset has exactly one explainable mapping outcome in the current generation.
- Direct assignments and trace mappings are visibly and contractually distinct.
- The six current unit relationships are returned as architecture realizations.
- Existing v6 IDs and the v5/v6 historical read paths remain unchanged.
- PostgreSQL remains authoritative and MCP remains the only authored-fact write boundary.
- Repository ADR, Proposal, Context Pack, evidence, typed links, and MCP records agree before the implementation session closes.

## 中文本地化覆盖

### 问题与目标

当前系统把两类不同事实都称为“映射”：一类是设计资产归属于 BIZ、SYS 或 TECH 架构单元；另一类是架构单元之间的 BIZ 到 SYS、SYS 到 TECH 跨层关系。产品语义中的“3A 映射”应当是第一类，即从设计资产出发，回答它属于哪个 3A 单元、为什么这样归属，以及该结论是直接编写还是通过关系证据推导。

本设计把“设计资产到 3A 映射”确立为主要产品和 MCP 概念，并把单元间关系改称“架构实现关系”。现有 v6 的 8 个单元、42 条直接成员归属和 6 条跨层关系保持不变，不执行破坏性重命名，也不自动发布 v7。

### 设计资产映射

新增不可变、绑定代次的 `Asset3AMappingProjection` 读模型。每个精确 Scope 内的目录资产在一个映射代次中只产生一个主要结果：

- `DIRECT`：由已发布 Baseline 中接受的成员修订直接归属，是权威架构位置；
- `TRACE`：通过有界、有类型、同 Scope 的关系路径追溯到直接成员，是派生解释，不是权威归属；
- `EXEMPT`：经过治理后明确不需要结构归属，并记录负责人、理由和触发条件；
- `BLOCKED`：缺少可信目标或存在多目标歧义，禁止猜测。

映射记录包含资产身份、中英文展示内容、目标单元及层级、模式、成员修订或关系路径、证据、置信度、原因、Baseline、Profile、目录与关系水位线、覆盖代次、内容摘要和新鲜度。PostgreSQL 继续保存权威资产、成员、关系、Baseline 和覆盖代次；该读模型可重建，不依赖 NebulaGraph。

### 架构实现关系

现有 `ArchitectureUnitMapping` 的语义不删除，但在新公开契约和页面中改称 `ArchitectureRealization`。它只连接架构单元，用于表达业务能力如何由系统服务实现，以及系统服务依赖何种技术服务。现有 6 条记录属于这一类，而不是设计资产到 3A 的映射。

第一阶段保留原数据库表、稳定 ID 和兼容字段。`search_3a_architecture_map` 新增规范字段 `realizations`，旧字段 `mappings` 作为至少一个兼容周期的弃用别名继续返回相同数据。

### MCP 与页面

MCP 新增只读工具 `search_3a_asset_mappings`、`get_3a_asset_mapping` 和 `search_3a_architecture_realizations`。直接归属仍通过现有 MCP 架构事实批次、审核、晋升、对账和 Baseline 发布流程写入；追溯映射是派生结果，不增加写入工具。

3A 工作台拆成三个明确视图：

1. “资产映射”展示设计资产到 BIZ/SYS/TECH 单元的归属、模式和证据，是主要映射视图；
2. “架构实现”展示 BIZ 到 SYS 到 TECH 的单元实现链；
3. “关系网络”展示资产之间的详细类型关系和影响分析。

页面必须明确区分直接归属与追溯映射，不能让 `TRACE` 看起来与权威 `DIRECT` 相同。无精确 Scope 权限时，在读取任何记录或计数前失败关闭。

### v7 边界与验收

本语义修正完成后才开展 v7 单元扩充。候选单元必须由多个相关资产、明确双语职责、来源负责人、直接类型证据和实际架构收益共同支持。首轮候选审核会评估连接器执行、变更证明、关系图投影和派生图运行时，但代码中存在这些模块不等于自动批准为架构单元。

验收要求每个授权 Scope 资产都有唯一且可解释的映射结果；直接归属与追溯映射在契约和页面中严格区分；现有 6 条单元关系按“架构实现关系”返回；v5/v6 历史身份和计数保持可读；PostgreSQL 权威、MCP-only 编写边界、双语内容及精确 Scope 隔离全部保持不变。
