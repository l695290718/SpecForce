# ER Usability And Field Ownership Correction

Status: Approved in design discussion; awaiting written-spec review

Date: 2026-08-20

Owning application service: `com.huawei.celon.desiner`

Owning Scope: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

Design Change Session: `design-change-session:d4534150-0737-48be-a133-9e7986c132ee`

Extends: `docs/superpowers/specs/2026-08-20-field-anchored-draggable-er-cards-design.md`

Governing ADR: `adr-webgl-data-model-er-workspace`

## 1. Problem

The current ER workspace is not usable for inspection. Loaded fields disappear when the graph enters compact LOD, long canonical entity names overflow fixed card headers, and blank-canvas pan is unreliable because pointer handling is attached to the transformed content root. Explicit zoom controls are also missing.

A separate authoritative-data defect makes the problem worse. The exact Scope currently returns 40 entities and 27 fields, but most fields come from legacy multi-entity data models without `entityId`. The system cannot safely assign those fields to an entity, so entity cards correctly project zero owned fields. The UI must not invent ownership to make the diagram look complete.

## 2. Considered Approaches

1. **Strict correction, selected.** Upgrade authored models to DataModel v2 through MCP, require explicit field ownership, surface unresolved legacy fields as quality issues, and repair canvas interaction and visual fitting.
2. **Runtime heuristic assignment, rejected.** Guess field ownership from names or ordering. This produces attractive but unauthoritative ER diagrams and corrupts impact analysis.
3. **Presentation-only correction, rejected.** Improve zoom, pan, and labels while leaving every entity at zero fields. This does not satisfy the inspection use case.

## 3. Decisions

1. PostgreSQL remains authoritative for authored data models. Data-model corrections are written only through the exact-Scope MCP boundary.
2. Every multi-entity DataModel v2 field must have a valid `entityId`; the referenced entity must exist in `entityDefinitions`.
3. Legacy unowned fields are never attached heuristically. They produce an explicit `FIELD_OWNERSHIP_AMBIGUOUS` quality result until corrected.
4. Normal workspace zoom always renders every loaded, owned field row. Compact LOD may simplify labels only at a genuinely distant overview scale; zooming in restores complete rows.
5. The fixed viewport stage owns pan and pointer-up handling. The transformed graph root owns only graph content. Entity and field pointer events stop propagation so card drag and selection do not pan the canvas.
6. The toolbar provides zoom in, zoom out, current zoom percentage, fit-to-view, reset-view, and reset-layout controls. Wheel or trackpad zoom remains centered on the pointer.
7. Entity and physical names are constrained to the card header. A deterministic fitted label uses bounded font sizing and ellipsis; full canonical names remain available in the inspector and accessible semantic representation.
8. No new page authoring UI is introduced. Model correction remains MCP-only.

## 4. Authoritative Field Upgrade

The correction covers all 12 self-design data models currently visible in the owning Scope: `data-specforge-3a-projection-read-model`, `data-specforge-ai-generation`, `data-specforge-asset-graph`, `data-specforge-assets`, `data-specforge-audit`, `data-specforge-i18n`, `data-specforge-mcp-registry`, `data-specforge-nebula-generation-projection`, `data-specforge-scan-batch`, `data-specforge-scan-session`, `data-specforge-source-observation-v2`, and `data-specforge-web-workspace`. This inventory contains 40 entities. Models with legacy unowned fields and models with no field facts are both incomplete. For each affected model:

- define stable `entityDefinitions` with canonical IDs, names, physical names, and ordinals;
- define stable fields with `id`, `entityId`, field name, display name, data type, ordinal, nullability, owner, and applicable key or sensitivity metadata;
- preserve English canonical content and complete Chinese human-facing localization;
- define field mappings only where an authored relationship and evidence support them;
- reject missing entities, duplicate field IDs, duplicate ordinals within one entity, and ambiguous ownership before persistence.

The first acceptance fixture is `data-specforge-ai-generation`. `GeneratedDraft` and its sibling entities must receive explicit owned fields rather than inheriting the model's legacy unassigned field list. Delivery is not complete until every one of the 40 current entities has an explicit reviewed field definition or an explicit documented reason that the entity is intentionally fieldless. The same validation applies to every later model upgrade.

## 5. Read And Projection Flow

`GET /api/data-model-graph` continues to return exact-Scope graph facts and waterlines. The client consumes all verified pages for the active query before declaring the workspace complete. Projection groups `dataField` nodes under `dataEntity` nodes only from authored `CONTAINS` relationships or explicit v2 `entityId` metadata.

Unowned legacy fields remain queryable as facts but are excluded from entity cards and reported in projection quality issues. A partial page set cannot be presented as a complete ER diagram. A snapshot or cursor mismatch aborts aggregation and offers retry without mixing waterlines.

## 6. Canvas Interaction And Rendering

The Pixi stage has a stable screen-space hit area matching the canvas dimensions. Pointer-down on blank stage starts panning; global pointer move and pointer-up complete the gesture even when the pointer leaves graph content. Entity card drag remains world-coordinate based and updates connected routes.

Zoom commands apply bounded scale steps around the viewport center. Wheel zoom applies around the pointer. Camera changes update a visible percentage without remounting the renderer. The minimum and maximum scale remain bounded to prevent losing the topology.

Card width is stable. Header labels are fitted to the available width after padding and status affordances. Field rows show marker, field name, and type within non-overlapping columns. Full values remain available through selection and semantic DOM content.

## 7. Failure And Quality Behavior

- `FIELD_OWNERSHIP_AMBIGUOUS` blocks a model upgrade and identifies the affected model and field IDs.
- Missing or invalid v2 ownership is not replaced with guessed ownership.
- Partial graph paging displays a partial-state warning and does not claim zero fields as authoritative.
- WebGL or context failure preserves the semantic entity and field catalog.
- Long labels never expand card dimensions or overlap adjacent content.
- Camera interaction failure is covered by deterministic stage-event tests and browser acceptance.

## 8. Verification

Focused tests must prove:

- DataModel v2 rejects ambiguous or missing ownership in multi-entity models;
- the AI generation model projects owned fields for `GeneratedDraft` and sibling entities;
- legacy unowned fields become quality issues rather than guessed rows;
- normal LOD keeps loaded fields visible and distant LOD restores them after zoom-in;
- long canonical and physical names fit within card bounds;
- toolbar zoom commands update bounded camera scale and percentage;
- blank-canvas drag pans while entity drag moves only the entity;
- wheel zoom remains pointer-centered;
- graph page aggregation preserves one waterline and exposes partial failures;
- English and Chinese labels and quality messages are complete.

Browser acceptance on ports 3000 and 3010 must verify visible fields, no header overflow, working zoom buttons, wheel zoom, blank-canvas pan, entity drag, field selection, and an empty browser error log.

## 9. Delivery Boundary

Completion requires code, MCP-authored DataModel v2 corrections, ADR/Proposal/Context Pack updates, typed links, focused tests, exact-Scope reconciliation, and closure of the same design-change session as `CONVERGED`. A model that still has ambiguous field ownership remains explicitly incomplete.

---

# ER 可用性与字段归属纠偏

状态：设计讨论已确认，等待书面规格复核

日期：2026-08-20

所属应用服务：`com.huawei.celon.desiner`

所属 Scope：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

设计变更会话：`design-change-session:d4534150-0737-48be-a133-9e7986c132ee`

## 1. 问题

当前 ER 工作区不适合实际查看。图进入紧凑 LOD 后会隐藏已加载字段，较长实体名会溢出固定表头，空白画布平移因事件绑定在已变换的内容根节点上而不稳定，并且缺少明确的缩放控件。

另一个独立的权威数据缺陷使问题更明显。当前精确 Scope 返回 40 个实体和 27 个字段，但大多数字段来自缺少 `entityId` 的旧版多实体数据模型。系统无法安全判断字段归属，所以实体卡片只能投影为零个已归属字段。前端不得为了让图看起来完整而伪造归属。

## 2. 方案选择

1. **严格纠偏，已选择。** 通过 MCP 将已编写模型升级为 DataModel v2，强制显式字段归属，将未解决旧字段暴露为质量问题，同时修复画布交互与文本适配。
2. **运行时启发式归属，已拒绝。** 根据名称或顺序猜测归属，会生成美观但不权威的 ER 图，并污染影响分析。
3. **仅修复展示，已拒绝。** 只改进缩放、平移和名称显示，但所有实体仍然没有字段，无法满足查看需求。

## 3. 决策

1. PostgreSQL 继续作为已编写数据模型的权威存储；数据模型纠偏只能通过精确 Scope 的 MCP 边界写入。
2. 每个多实体 DataModel v2 字段都必须具有有效 `entityId`，且必须引用 `entityDefinitions` 中已存在的实体。
3. 旧版未归属字段禁止启发式挂载；在纠偏前显式产生 `FIELD_OWNERSHIP_AMBIGUOUS` 质量结果。
4. 正常缩放下始终渲染全部已加载、已归属的字段行。只有在真正远距离总览时才可简化，放大后自动恢复完整字段。
5. 固定视口的 stage 负责平移和指针结束事件，已变换的图根节点只负责图内容。实体和字段事件停止冒泡，保证拖表与拖画布不冲突。
6. 工具栏提供放大、缩小、当前缩放比例、适应画布、重置视图和重置布局。滚轮或触控板缩放继续围绕指针位置。
7. 实体名和物理名必须受表头宽度约束，使用有界字号和省略显示；完整规范名仍在检查器与可访问语义表示中可用。
8. 不新增页面编辑能力，模型纠偏仍为 MCP-only。

## 4. 权威字段升级

纠偏覆盖当前 Scope 中全部 12 个自设计数据模型和 40 个实体。包含旧版未归属字段的模型和完全没有字段事实的模型都属于未完整。每个受影响模型需要定义稳定的实体 ID、名称、物理名和顺序，以及包含 `id`、`entityId`、字段名、显示名、类型、顺序、可空性、负责人和相关键或敏感属性的稳定字段。英文是规范内容，面向人的内容必须提供完整中文覆盖。

首个验收模型为 `data-specforge-ai-generation`。`GeneratedDraft` 及其他实体必须获得显式归属字段，不再共享旧版未归属字段列表。当前 40 个实体每个都必须拥有已复核的显式字段定义，或者有明确记录的“有意无字段”原因，否则不能声称交付完成。

## 5. 读取、投影与交互

`GET /api/data-model-graph` 继续返回精确 Scope 的图事实和水位。客户端在声明完整前必须消费当前查询的全部已验证分页。投影只能根据已编写 `CONTAINS` 关系或 v2 `entityId` 元数据将字段归入实体。未归属旧字段保持可查询，但不进入实体卡片，并作为投影质量问题显示。

Pixi stage 具有与画布尺寸一致的屏幕坐标命中区。在空白 stage 按下开始平移，全局移动与抬起事件完成手势。缩放按钮围绕视口中心使用有界比例步进，滚轮围绕指针缩放。卡片宽度稳定，表头文本适配可用宽度，字段行以不重叠的标记、名称和类型列显示。

## 6. 失败、验证与交付

`FIELD_OWNERSHIP_AMBIGUOUS` 必须阻止模型升级并指明模型与字段。分页不完整时页面显示部分状态，不把零字段声称为权威结果。WebGL 降级时保留语义实体和字段目录。长文本不得改变卡片尺寸或与其他内容重叠。

聚焦验证必须覆盖 v2 归属校验、AI 生成模型字段投影、旧字段质量问题、LOD 字段可见性、长名适配、工具栏缩放、空白画布平移、实体拖动、指针中心缩放、分页水位一致性和中英文覆盖。3000 与 3010 端口的浏览器验收必须验证字段可见、表头不溢出、缩放按钮、滚轮缩放、空白画布平移、实体拖动、字段选择和空错误日志。

完成需要代码、通过 MCP 编写的 DataModel v2 纠偏、ADR/Proposal/Context Pack 更新、有类型关系、聚焦测试、精确 Scope 对账，并将同一设计变更会话以 `CONVERGED` 关闭。仍存在歧义字段归属的模型必须明确保持未完成状态。
