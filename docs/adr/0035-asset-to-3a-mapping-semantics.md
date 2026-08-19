# ADR-0035: Asset-to-3A Mapping Semantics

## Status

Accepted for the first compatibility implementation.

- Stable ID: `adr-asset-to-3a-mapping-semantics`
- Owning application service: `com.huawei.celon.desiner`
- Owning Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Design Change Session: `design-change-session:8341f602-0627-463b-9aae-1636fcfe8e94`
- Spec: `docs/superpowers/specs/2026-08-19-asset-to-3a-mapping-semantics-design.md`

## Context

The product's primary 3A question is where a design asset belongs in BIZ, SYS, or TECH. The existing projection also contains six unit-to-unit cross-layer records, but those records describe architecture realization rather than asset classification. Calling both concepts "mapping" makes MCP consumers and users misread the architecture view.

The current Designer v6 Baseline remains the structural source of truth: 8 units, 42 direct memberships, and 6 unit-to-unit relationships. Coverage generation v13 provides bounded evidence for all 307 authored records. The asset mapping read-back currently reports 38 DIRECT, 255 TRACE, 14 BLOCKED, and 0 EXEMPT outcomes; BLOCKED means no current v6 3A terminal can be resolved and is not an invented assignment. These facts must remain immutable and backward-compatible.

## Decision

Use three explicit relationship concepts:

1. Asset-to-3A mapping: design asset to BIZ/SYS/TECH unit.
2. Architecture realization: BIZ-to-SYS or SYS-to-TECH unit relationship.
3. Design-fact relationship: typed asset-to-asset evidence used for traceability and impact analysis.

Expose `DIRECT`, `TRACE`, `EXEMPT`, and `BLOCKED` mapping outcomes. Direct membership is authoritative; trace mapping is a rebuildable explanation and never creates an authored membership. Unit-to-unit projections remain persisted under compatible IDs but are named Architecture Realization in new contracts and UI.

PostgreSQL remains authoritative. MCP remains the only authored-fact write boundary. Exact Scope authorization is checked before any count or record is returned.

## Consequences

- Asset mapping becomes the primary 3A user and MCP experience.
- Existing v5/v6 Baselines and realization IDs remain readable.
- Derived trace results cannot silently become canonical architecture facts.
- Later v7 unit expansion can use asset mapping ambiguity and convergence as evidence.

## Rejected Alternatives

- Renaming only visible labels: rejected because MCP contracts would remain ambiguous.
- Replacing both concepts with generic graph edges: rejected because authority and lifecycle differ.
- Automatically splitting units from names or graph proximity: rejected because it invents unreviewed architecture semantics.

## Verification

The implementation uses the exact Designer Scope, bilingual canonical records, bounded MCP reads, and focused core/MCP/Web checks. Coverage v13 is CURRENT at 307/307 COVERED with maximum path length 3. The matching MCP Evidence record contains the exact commands and read-back results.

## 中文本地化覆盖

### 状态

已接受，进入第一阶段兼容实现。

### 背景

产品中的核心 3A 问题是设计资产属于 BIZ、SYS 还是 TECH。现有投影还包含 6 条架构单元之间的跨层记录，但这些记录描述的是架构实现关系，而不是设计资产分类。两者都叫“映射”会让 MCP 客户端和用户误解架构视图。

当前 Designer v6 Baseline 仍是结构真相：8 个单元、42 条直接归属和 6 条单元间关系。覆盖代次 v13 为 307 条设计记录提供有界证据。资产映射回读为 DIRECT 38、TRACE 255、BLOCKED 14、EXEMPT 0；BLOCKED 表示当前 v6 没有可解析的 3A 终点，不是系统臆造的归属。这些事实必须保持不可变并向后兼容。

### 决策

明确拆分三类关系：设计资产到 3A 映射、架构实现关系和设计事实关系。资产映射使用 `DIRECT`、`TRACE`、`EXEMPT`、`BLOCKED` 四种结果。直接归属是权威事实，追溯映射是可重建解释，不能创建新的权威成员归属。单元间投影继续使用兼容 ID 保存，但在新契约和页面中称为“架构实现”。

PostgreSQL 保持权威，MCP 保持唯一设计事实写入边界。任何计数或记录返回前都必须执行精确 Scope 授权校验。

### 后果与验收

资产映射成为主要 3A 用户界面和 MCP 体验；v5/v6 Baseline 及已有实现关系 ID 保持可读；追溯结果不能静默升级为架构事实；后续 v7 单元扩充使用资产映射中的歧义和收敛证据。匹配的 MCP Evidence 记录保存精确命令和回读结果。
