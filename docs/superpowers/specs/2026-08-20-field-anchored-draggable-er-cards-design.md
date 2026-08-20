# Field-Anchored Draggable ER Cards

Status: Approved in design discussion; awaiting written-spec review

Date: 2026-08-20

Owning application service: `com.huawei.celon.desiner`

Owning Scope: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

Design Change Session: `design-change-session:6249b0a9-bd5b-476d-81e6-b78bf7b19afc`

Extends: `docs/superpowers/specs/2026-08-20-webgl-data-model-er-workspace-design.md`

Governing ADR: `adr-webgl-data-model-er-workspace`

## 1. Problem And Corrective Scope

The current implementation does not fulfill the approved ER workspace design. The read contract already exposes stable model, entity, field, and structured relationship facts, but the client renders every graph node as the same fixed card, shows only a field count, anchors every edge at card centers, and has no camera or drag interaction. The result is a table-level topology preview rather than a usable ER diagram.

This corrective increment completes the existing design. It does not introduce a new source of truth, authoring surface, relationship inference rule, or cross-Scope read capability.

## 2. Decisions

1. Keep `GET /api/data-model-graph`, exact-Scope authorization, signed waterlines, PostgreSQL authority, and MCP-only authoring unchanged.
2. Add a client-side `ErDiagramProjection` that groups flat graph facts into model groups, entity cards, ordered field rows, relation groups, and field-port mappings.
3. Render one draggable card per data entity. Data fields are ordered rows inside the card, not independent floating nodes.
4. Treat `CONTAINS` edges as hierarchy input. They are not displayed as business relationships.
5. Draw each structured field-level `REFERENCES` mapping from the exact source field port to the exact target field port.
6. Draw an entity-level relation without field mappings between card headers and label it as an entity relation with unconfigured field mapping. Never infer a foreign key from names or narrative text.
7. Persist dragged positions as browser workspace preferences keyed by exact Scope, graph mode, root model, and topology digest. Positions are not authored design facts and are never written through MCP.
8. Preserve an always-available semantic DOM representation and deterministic fallback states.

The endpoint and paging model remain stable, but the existing extensible node and edge `metadata` payloads must be enriched. Entity metadata supplies physical name and ordinal. Field metadata supplies entity identity, display name, type, ordinal, key and uniqueness flags, nullability, generated state, classification, and ownership when authored. Relation metadata continues to supply relation ID, mapping index and count, cardinalities, referential actions, constraint name, and evidence. This is a backward-compatible response enrichment, not a second API.

## 3. Diagram Projection

The renderer consumes a view model rather than the raw flat graph response:

```ts
interface ErDiagramProjection {
  identity: {
    applicationServiceId: string;
    scopePath: string;
    mode: "MODEL" | "SCOPE";
    rootModelId?: string;
    catalogDigest: string;
    relationshipDigest: string;
    topologyDigest: string;
  };
  models: ErModelGroup[];
  entities: ErEntityCard[];
  relations: ErRelationGroup[];
  qualityIssues: ErQualityIssue[];
}

interface ErEntityCard {
  id: string;
  modelId: string;
  name: string;
  physicalName?: string;
  fields: ErFieldRow[];
  external: boolean;
}

interface ErFieldRow {
  id: string;
  name: string;
  displayName: string;
  dataType: string;
  ordinal: number;
  primaryKey: boolean;
  foreignKey: boolean;
  unique: boolean;
  nullable: boolean;
  generated: boolean;
  classification?: string;
}

interface ErRelationGroup {
  id: string;
  kind: string;
  sourceEntityId: string;
  targetEntityId: string;
  mappings: Array<{ sourceFieldId: string; targetFieldId: string }>;
  mappingConfigured: boolean;
  cardinality?: { source: string; target: string };
  onUpdate?: string;
  onDelete?: string;
  evidenceRefs: string[];
}
```

Projection is deterministic: inputs are sorted by stable IDs and field ordinals; duplicate endpoints or mappings are rejected into quality issues; relations are displayed only when both required endpoints are loaded under the same read binding.

The projection derives the visual `foreignKey` indicator only from an authored outgoing field-level `REFERENCES` mapping. It is a view property, not a newly authored field flag.

## 4. Card Rendering

Entity cards use a compact database-tool visual language with a restrained radius, clear borders, and stable dimensions. The header shows entity name, owning model, boundary status, and field count. Each field row shows the field name and data type, plus icon-and-text indicators for primary key, foreign key, unique, generated, and nullable state.

At normal and near zoom, every loaded field row is visible. At far zoom, semantic LOD reduces a card to its header, primary keys, and field count. Zooming back restores the complete field rows. LOD never changes the loaded facts or relationship authority.

Field ports are computed from the card position, header height, row height, and field ordinal. Source ports are on the right edge and target ports are on the left edge. Entity-only relations use explicit header ports. Selected relation groups expose cardinality, referential actions, constraint names, evidence, and every composite mapping in the inspector.

## 5. Camera, Drag, And Selection

The canvas supports pointer pan, wheel or trackpad zoom, fit-to-topology, reset layout, double-click focus, entity drag, pin, and unpin. Dragging an entity updates connected edge geometry on every animation frame and does not invoke layout repeatedly.

Pointer handling has explicit modes: `IDLE`, `PANNING`, `DRAGGING_ENTITY`, and `SELECTING`. A movement threshold prevents a click from becoming an accidental drag. Pointer capture ensures a drag completes when the pointer leaves the card.

Selecting a field highlights only its incoming and outgoing mappings. Selecting an entity highlights its direct relation groups. Selecting one edge in a composite relation highlights the complete relation group. Empty-canvas selection clears the inspector focus.

## 6. Position Persistence

Local positions are stored under a versioned key derived from:

- exact `applicationServiceId` and `scopePath`;
- graph mode and optional root model ID;
- topology digest based on sorted entity identities;
- layout preference schema version.

Only finite coordinates for currently visible entity IDs are accepted. A Scope, root, topology, or version mismatch invalidates the stored positions. Reset layout deletes only the exact current workspace preference and reruns deterministic layout. No position payload is sent to the server.

## 7. Relationship Semantics

Field-to-field lines are authoritative only when backed by structured `fieldMappings`. Composite mappings share one relation-group identity and visual selection state. Entity-level relations with no field mappings remain visible but are clearly marked `FIELD_MAPPING_UNCONFIGURED` and connect card headers.

A missing field endpoint, duplicate mapping, cross-Scope endpoint, or inconsistent relation metadata is a quality issue. The renderer does not silently convert it into a guessed field edge or a normal entity edge. Narrative legacy relationship strings remain notes outside the authoritative ER relation layer.

## 8. Layout And Routing

The layout Worker receives entity cards with measured widths and heights. Fields remain rows and ports, not ELK nodes. The Worker lays out connected components and model groups, then returns entity positions. Persisted user positions override only matching entity coordinates after layout.

Edges use orthogonal routes with a short port lead, shared relation-group styling, and collision-aware middle segments where available. During drag, connected routes use a fast local recomputation; a full Worker layout runs only on reset, topology change, or explicit layout command.

## 9. Inspector And Semantic Representation

The desktop inspector is an unframed right panel; compact viewports use a bottom sheet. It displays canonical and localized names, stable identity, owning model, field facts, source and target mappings, relation group, cardinality, referential actions, evidence, read waterlines, and quality issues.

The semantic DOM list mirrors entities, fields, and relations. Keyboard selection invokes the same renderer focus commands. WebGL failure, context loss, or layout degradation preserves the graph store and selection and exposes a retry without refetching valid pages.

## 10. Error Behavior

- Incomplete endpoint pages hide the affected relation and mark the workspace `PARTIAL`.
- Missing mapped fields produce `ENDPOINT_NOT_FOUND` quality issues.
- Entity-only relations without mappings produce `FIELD_MAPPING_UNCONFIGURED`, not an inferred foreign key.
- Invalid saved positions are ignored without changing design data.
- Layout failure uses a stable grid and reports `LAYOUT_DEGRADED`; dragging remains available.
- WebGL failure uses the semantic representation and preserves query state.
- Capacity limits retain only verified pages and never describe a truncated result as complete.

## 11. Verification

Focused tests must prove:

- deterministic flat-fact to card-and-field projection;
- stable field ordering and PK, FK, unique, nullable, generated, and type display;
- exact field-port coordinates and entity-header fallback ports;
- composite relation grouping and strict no-inference behavior;
- camera transforms, pointer mode transitions, drag threshold, pointer capture, and live edge updates;
- exact-Scope local-position keys, refresh restoration, reset, and stale-position rejection;
- LOD transitions without semantic loss;
- inspector and semantic-list parity in English and Chinese;
- WebGL/context/layout fallback behavior.

Browser acceptance on ports 3000 and 3010 must verify a nonblank Canvas, visible field rows, exact field-to-field edges, drag coordinate change, live route movement, refresh restoration, reset layout, selection highlighting, semantic fallback, responsive inspector, and an empty browser error log.

## 12. Delivery Boundary

This written design records approved behavior and the implemented repository slice. Tasks 1-5 are implemented with focused tests, Web typecheck, and a non-standalone Web build. The 3000 fresh-browser inspection is blocked by the browser URL policy after service restart, and 3010 Docker browser acceptance remains pending. Matching ADR/Proposal/Context Pack/API updates through MCP and exact-Scope reconciliation are required before this session can be declared converged.

---

# 字段锚定、可拖拽的 ER 表卡片

状态：设计已确认，Tasks 1-5 已实现；3000 浏览器验收受 URL 安全策略阻塞，3010 Docker 已重建并健康，浏览器交互验收待执行

日期：2026-08-20

所属应用服务：`com.huawei.celon.desiner`

所属 Scope：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

设计变更会话：`design-change-session:23b28112-6a74-4dde-8367-845e4e977b6d`

## 1. 问题与纠偏范围

当前实现没有兑现已批准的 ER 工作区设计。读取契约已经提供稳定的模型、实体、字段和结构化关系事实，但客户端把所有节点画成相同的固定卡片，只显示字段数量，所有连线都锚定到卡片中心，也没有画布相机或拖拽交互。因此当前页面只是表级拓扑预览，不是可用的 ER 图。

本增量用于完成既有设计，不新增权威数据源、页面写入能力、关系推断规则或跨 Scope 读取能力。

## 2. 决策

1. 保持现有 `GET /api/data-model-graph`、精确 Scope 授权、签名水位、PostgreSQL 权威和 MCP-only 写入不变。
2. 客户端新增 `ErDiagramProjection`，把扁平图事实聚合为模型分组、实体表卡片、有序字段行、关系组和字段端口映射。
3. 每个数据实体渲染为一张可拖拽表卡片；字段是表内有序行，不再作为独立漂浮节点。
4. `CONTAINS` 关系只用于构建层级，不显示为业务关系线。
5. 每条结构化字段级 `REFERENCES` 映射都从精确源字段端口连到精确目标字段端口。
6. 没有字段映射的实体关系连接表头，并标记“实体关系 / 未配置字段映射”；禁止根据名称或叙述文本猜测外键。
7. 拖拽坐标按精确 Scope、图模式、根模型和拓扑摘要保存为浏览器工作区偏好，不属于设计事实，也不通过 MCP 写入。
8. 始终提供语义 DOM 表示和确定性降级状态。

端点和分页模型保持稳定，但必须兼容性补充现有可扩展节点、关系 `metadata`。实体元数据提供物理名称和顺序；字段元数据提供实体身份、显示名、类型、顺序、主键与唯一标记、可空、生成状态、分类和已编写负责人；关系元数据继续提供关系 ID、映射序号与数量、基数、引用动作、约束名和证据。这是兼容性响应增强，不是第二套 API。

## 3. 图投影视图模型

渲染器不直接消费扁平图响应，而是消费确定性的 ER 视图模型。模型分组包含实体表；实体表按 `ordinal` 展示字段；关系组包含稳定关系身份、源目标实体、字段映射、基数、引用动作和证据。输入按稳定 ID 与字段顺序排序；重复端点或重复映射进入数据质量问题；只有在同一读取绑定下所需端点均已加载时才显示关系。视觉上的外键标记只由已编写的字段级出向 `REFERENCES` 映射派生，它是视图属性，不是新增的权威字段标记。

## 4. 表卡片与字段端口

表卡片采用紧凑的数据库工具视觉风格，使用克制圆角、清晰边框和稳定尺寸。表头显示实体名、所属模型、边界状态和字段数量；字段行显示字段名、数据类型以及主键、外键、唯一、生成和可空状态，并使用图标与短文本共同表达。

正常和近距离缩放默认展示全部已加载字段。远距离缩放只保留表头、主键和字段数量；放大后恢复全部字段。字段端口由表坐标、表头高度、行高和字段顺序计算，源端口位于右侧，目标端口位于左侧。无字段映射的实体关系使用明确的表头端口。

## 5. 相机、拖拽和选择

画布支持指针平移、滚轮或触控板缩放、适配全图、重置布局、双击聚焦、实体拖拽、固定和取消固定。拖动实体时，每一动画帧更新相关连线，不重复执行全局布局。

指针状态明确区分空闲、平移、拖拽实体和选择，使用移动阈值避免误拖，并通过指针捕获保证指针移出表卡片后仍能完成拖拽。选择字段只高亮该字段的上下游映射；选择实体高亮直接关系；选择复合关系中的任一边会高亮完整关系组。

## 6. 位置持久化

本地位置键包含精确应用服务、Scope 路径、图模式、可选根模型、实体拓扑摘要和偏好 Schema 版本。只接受当前可见实体的有限数值坐标。Scope、根模型、拓扑或版本不匹配时忽略旧位置。“重置布局”只删除当前精确工作区偏好并重新运行确定性布局，不向服务端发送坐标。

## 7. 关系语义

只有结构化 `fieldMappings` 才能生成字段到字段连线。复合映射共享同一关系组身份与选中状态。没有字段映射的实体关系保持可见，但必须标记 `FIELD_MAPPING_UNCONFIGURED` 并连接表头。

字段端点缺失、映射重复、跨 Scope 端点或关系元数据不一致都属于质量问题。渲染器不得把它们悄悄改成猜测字段线或普通实体线。旧版叙述性关系字符串只作为备注，不进入权威 ER 关系层。

## 8. 布局、检查器与降级

布局 Worker 只接收带实际宽高的实体表，字段保持为表内行和端口，不作为 ELK 节点。布局完成后，匹配当前拓扑的用户位置覆盖对应实体坐标。关系使用正交路径；拖拽期间只快速重算相邻路径，只有重置、拓扑变化或显式布局命令才运行完整布局。

桌面检查器使用无卡片嵌套的右侧面板，小屏使用底部面板。检查器展示中英文名称、稳定身份、所属模型、字段事实、源目标映射、关系组、基数、引用动作、证据、水位和质量问题。语义列表镜像实体、字段与关系，并支持键盘触发相同的聚焦命令。

WebGL、上下文或布局失败时保留图数据与选择。布局失败使用稳定网格并显示 `LAYOUT_DEGRADED`，拖拽继续可用；WebGL 失败切换语义表示；容量超限只保留已验证页面，不把截断结果描述为完整图。

## 9. 验收

聚焦测试必须覆盖确定性聚合、字段顺序与标记、字段端口、复合关系组、严格禁止推断、相机变换、拖拽状态、实时连线、Scope 隔离的位置保存、刷新恢复、重置、过期坐标拒绝、LOD、检查器、双语语义列表和降级行为。

3000 与 3010 端口浏览器验收必须覆盖非空 Canvas、字段行可见、字段级端点准确、拖拽坐标变化、连线实时移动、刷新恢复、重置布局、选择高亮、语义回退、响应式检查器以及空浏览器错误日志。

## 10. 交付边界

本文只记录已确认的设计行为；本设计会话下尚未开始实施。完成必须包含代码、聚焦测试、3000/3010 浏览器证据、通过 MCP 同步的 ADR、Proposal、Context Pack 和 API 记录、精确 Scope 对账，并以 `CONVERGED` 关闭同一设计变更会话。
