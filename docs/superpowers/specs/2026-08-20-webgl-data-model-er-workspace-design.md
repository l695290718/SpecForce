# SpecForge WebGL Data Model ER Workspace

Status: Draft for written review  
Date: 2026-08-20  
Owning application service: `com.huawei.celon.desiner`  
Owning Scope: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`  
Design Change Session: `design-change-session:7becc74f-cdf5-4512-8c6d-49d885c58f20`

## 1. Problem

The current Data Model detail renders one flat field table and narrative relationship strings. It cannot reliably answer which entity owns a field, which source fields participate in a composite reference, or which target fields are affected by a change. The existing generic asset graph uses React Flow, while the 3A graph uses Sigma and WebGL for ordinary graph nodes. Neither renderer directly represents ER entities as field-bearing records with field-level ports.

SpecForge needs a dedicated, exact-Scope ER workspace that can show one Data Model or every Data Model in the current application-service Scope. It must render entity structure, field facts, composite relationships, and cross-model references without making the browser or a derived graph store authoritative.

## 2. Goals

- Render a WebGL ER workspace on Data Model detail pages and as a global Data Model view.
- Support current-model and exact-Scope modes through one query and workspace contract.
- Show entity and field facts, including primary keys, foreign keys, data types, nullability, uniqueness, defaults, constraints, classification, and ownership.
- Draw references from exact source field ports to exact target field ports, including composite mappings.
- Preserve stable identity across entity, field, and relationship renames.
- Keep English canonical content and complete Chinese human-facing overlays.
- Preserve PostgreSQL authority, MCP-only authoring, exact-Scope isolation, typed relationship history, and deterministic failure behavior.
- Provide semantic zoom, all-topology expansion, search, filtering, inspection, accessibility fallback, and WebGL recovery.

## 3. Non-Goals

- The browser will not author or edit Data Models. Authoring remains MCP-only.
- The ER canvas will not become a second source of truth for layout or relationships.
- This increment will not authorize cross-application-service reads.
- It will not infer authoritative foreign keys from names, naming conventions, or narrative relationship strings.
- It will not claim an enterprise scale tier until that tier has measured evidence.
- It will not replace the general asset graph, 3A architecture graph, or NebulaGraph impact-analysis projection.

## 4. Chosen Approach

Use a dedicated PixiJS WebGL renderer for ER records and an ELK-based layout Worker. React owns commands, URL state, inspectors, localization, and semantic fallback. The renderer consumes an immutable ER read DTO and never reads or writes persistence directly.

Sigma remains the renderer for the existing 3A graph. It is not reused for ER rendering because its ordinary node model does not naturally represent variable-height entity records, field rows, and field ports. React Flow remains available to existing views but is not used for the global ER canvas because DOM/SVG entity records do not meet the all-topology rendering goal.

## 5. Canonical Data Model Contract

Data Model v2 introduces stable, name-independent identities.

```ts
interface DataEntityDefinition {
  id: string;
  name: string;
  physicalName?: string;
  description?: string;
  ordinal: number;
}

interface DataFieldDefinition {
  id: string;
  entityId: string;
  ordinal: number;
  fieldName: string;
  displayName: string;
  dataType: string;
  meaning?: string;
  nullable: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  generated?: boolean;
  defaultValue?: string;
  constraint?: string;
  sensitiveLevel?: "none" | "internal" | "confidential" | "restricted";
  classification?: string;
  example?: string;
  owner: string;
}

interface DataRelationCardinality {
  min: 0 | 1;
  max: 1 | "many";
}

interface DataFieldMapping {
  sourceFieldId: string;
  targetFieldId: string;
}

interface DataRelation {
  id: string;
  kind: "REFERENCE" | "ASSOCIATION" | "INHERITANCE";
  sourceEntityId: string;
  targetModelId: string;
  targetEntityId: string;
  sourceCardinality: DataRelationCardinality;
  targetCardinality: DataRelationCardinality;
  fieldMappings: DataFieldMapping[];
  identifying?: boolean;
  constraintName?: string;
  onUpdate?: "NO_ACTION" | "RESTRICT" | "CASCADE" | "SET_NULL" | "SET_DEFAULT";
  onDelete?: "NO_ACTION" | "RESTRICT" | "CASCADE" | "SET_NULL" | "SET_DEFAULT";
  description?: string;
  evidenceRefs: string[];
}
```

The enclosing source Data Model owns every relation and the source entity must belong to that model. `sourceCardinality` means the number of source instances allowed for one target instance; `targetCardinality` means the number of target instances allowed for one source instance. Requiredness is derived from the applicable minimum and is not stored twice.

Conceptual models may define entity-level relationships without field mappings. Logical models may define field mappings. Physical references require a non-empty mapping and may additionally define constraint names and referential actions. The write validator rejects physical-only controls on conceptual models, duplicate field mappings, incompatible field types, non-key targets, `SET_NULL` for non-nullable source fields, and `SET_DEFAULT` without compatible defaults.

The localized field and entity overlays are keyed by stable IDs rather than names. Technical identity, type, nullability, key flags, and referential actions cannot be modified by a translation overlay.

## 6. Relationship Authority And Atomicity

The complete `DataRelation` definition is authored in the source Data Model payload. The source model owns a cross-model relationship. In the same PostgreSQL transaction, MCP projects that definition into the typed relationship ledger:

- `DataModel CONTAINS DataEntity`
- `DataEntity CONTAINS DataField`
- one entity-level `REFERENCES` relationship per `DataRelation`
- one field-level `REFERENCES` relationship per `fieldMappings` entry

Every projected row carries the stable relation ID and source reference so the entity edge and field edges remain one governed relationship group. The asset payload and relationship rows cannot be edited independently.

Add an MCP command named `apply_data_model_change_set`. It atomically validates and applies one or more Data Model updates, including `DataRelation` additions or removals embedded in their owning source models, plus asset revisions, relationship events, and Outbox records. It resolves cross-model target endpoints from the same exact Scope and never creates an absent external endpoint implicitly.

Deleting an entity or field with an active inbound or outbound relationship fails closed unless the same change set removes or migrates every affected relation. Any validation, persistence, ledger, revision, or Outbox failure rolls back the complete change set.

## 7. Legacy Upgrade Policy

- Existing v1 Data Models remain readable through a compatibility adapter.
- New Data Models must use v2.
- A v1 Data Model must be upgraded before any mutation is accepted.
- A single-entity v1 model can be upgraded deterministically.
- A multi-entity model with ambiguous field ownership returns an upgrade diagnostic and requires explicit ownership supplied through MCP.
- Narrative relationship strings remain visible as legacy notes but never become authoritative typed relationships.
- Unassigned legacy fields appear in a dedicated group with a data-quality warning.
- No foreign key, entity ownership, or cardinality is inferred from field names.

## 8. ER Read Contract

The Web application uses a dedicated read service rather than assembling the graph from arbitrary asset JSON in the browser.

Two modes are supported:

- `MODEL`: load every entity in the selected Data Model and include referenced or referencing entities from other models as read-only boundary entities.
- `SCOPE`: load the complete Data Model, entity, and relationship topology for the exact application-service Scope.

The immutable client DTO contains model groups, entities, field summaries, full field pages, structured relations, field mappings, counts, quality issues, and the read binding. It is not accepted by any write API.

## 9. Consistent Read Binding

An ER read binding contains:

- exact `applicationServiceId` and `scopePath`
- authenticated subject identity
- query mode and optional root model ID
- `catalogVersion` and `catalogDigest`
- `relationshipVersion` and `relationshipDigest`
- expiry and signing-key ID

Signed cursors reuse the existing HMAC keyring pattern. A cursor is invalid when replayed by another subject, Scope, mode, root, or read binding.

Each page checks both waterlines before and after its read. A changed waterline invalidates the page and returns `409 SNAPSHOT_CHANGED`. This is a short-lived optimistic consistent-read binding, not a durable historical snapshot. The client keeps valid view preferences, obtains a new binding, and resolves the previous selection again. A deleted selection is cleared with an explicit notice.

Relationships are displayed only after both endpoints and the necessary field mappings are loaded. A failed page marks the workspace `PARTIAL`; it never presents a partial result as complete.

## 10. Renderer Architecture

The ER workspace has isolated units:

- `ErGraphRepository`: performs exact-Scope, keyset-paged reads and validates both waterlines.
- `ErGraphContract`: owns DTO, error, cursor, quality, and status types.
- `ErGraphStore`: merges immutable pages, deduplicates identities, and tracks completeness.
- `ErLayoutWorker`: creates deterministic entity and model positions.
- `ErTextureCache`: owns visible entity textures, LOD variants, and LRU eviction.
- `PixiErRenderer`: owns Pixi lifecycle, camera, hit testing, context recovery, and drawing.
- `ErWorkspace`: owns commands, URL state, search, filters, inspector, progress, and fallback.

Pixi is integrated imperatively to keep its lifecycle separate from React 19. React passes immutable snapshots and commands; it does not create one component per entity or field.

## 11. Layout

ELK does not repeatedly lay out the complete graph. The Worker:

1. sorts all model, entity, relation, and mapping inputs by stable ID;
2. partitions the topology into connected components;
3. lays out the model graph;
4. lays out entities inside each model group;
5. treats fields as rows and ports rather than independent layout nodes;
6. packs components and routes cross-model relationships;
7. rounds coordinates to stable values.

Only affected connected components are recomputed after a page or filter changes. A Worker failure uses a stable grid fallback and marks the result degraded; the fallback is not described as a formal ER layout.

Dragged positions are browser workspace preferences, keyed by Scope, mode, root model, and binding digest. They are not design facts and are never written through MCP.

## 12. Semantic Zoom And Rendering Budget

"Expand all" means every model, entity, and relationship in the selected topology is represented. It does not mean every field label is rasterized at every zoom level.

- Far LOD: model groups, entity outlines, relation density, and issue markers.
- Medium LOD: entity names, keys, foreign keys, and configured key fields.
- Near LOD: all visible field rows and complete field-port mapping.
- Selection: the inspector always exposes complete loaded facts regardless of visual LOD.

The renderer uses viewport culling. It creates detailed textures only for visible entities and evicts unused high-detail textures through an LRU budget. Far LOD does not allocate field text textures. This is particularly important for Chinese labels and large field catalogs.

No unsupported capacity is claimed. Performance evidence records hardware, browser, model count, entity count, field count, relationship count, payload size, query time, layout time, first meaningful frame, interaction frame rate, texture count, and recovery behavior.

The client enforces a configured, evidence-backed topology memory budget at page boundaries. Crossing the certified budget returns `CLIENT_CAPACITY_EXCEEDED`, retains the already verified pages as `PARTIAL`, reports exact counts, and asks the user to narrow the view. It never claims that a truncated topology is fully expanded. Increasing the budget requires new measured evidence rather than a silent configuration change.

## 13. User Experience

The Data Model detail page offers `ER Diagram` and `Field Catalog` views. ER mode defaults to the current model and can switch to the current Scope. The Data Model list offers `List` and `Global ER` views. Both surfaces use the same workspace, query contract, URL state, and localization.

The toolbar contains mode, search, model/entity/field filters, relation-kind filters, classification filters, fit, reset, and layout commands. The canvas supports pan, zoom, entity drag/pin, selection, relationship highlighting, and navigation between source and target fields.

The inspector presents identity, model, entity, field facts, relationship group, composite mappings, cardinalities, constraint controls, evidence, and quality issues. On compact viewports it becomes a bottom sheet. The workspace uses restrained full-width bands rather than nested cards.

## 14. Accessibility And Localization

The WebGL canvas is not the only representation of information. Search results, entities, fields, relationships, loading state, errors, and selection have semantic DOM equivalents. Keyboard users can select an entity or relationship from the synchronized semantic list and invoke the same focus commands.

WebGL initialization failure, context loss, texture-budget failure, and renderer exceptions preserve the loaded graph store, show the semantic fallback, and offer renderer retry without refetching valid pages.

English canonical labels are required. Chinese overlays cover model, entity, field, relationship description, constraint description, quality messages, commands, statuses, and inspector labels. Color is never the sole carrier of key, relation, selection, issue, or classification meaning.

## 15. Error Semantics

- `SCOPE_UNAVAILABLE`: fail closed without revealing whether a model exists.
- `CURSOR_INVALID`: reject a malformed, tampered, expired, or replayed cursor.
- `SNAPSHOT_CHANGED`: discard the affected page and restart from a new binding.
- `ENDPOINT_NOT_FOUND`: reject an authored relation or report a persisted dangling relation as a quality issue.
- `DATA_MODEL_UPGRADE_REQUIRED`: reject mutation of v1 data until it is upgraded.
- `FIELD_OWNERSHIP_AMBIGUOUS`: reject automatic multi-entity upgrade.
- `ACTIVE_REFERENCE_EXISTS`: reject deletion of a referenced entity or field.
- `PARTIAL`: retain verified pages, hide incomplete edges, and allow cursor retry.
- `WEBGL_UNAVAILABLE` or `WEBGL_CONTEXT_LOST`: use semantic fallback and preserve query state.
- `LAYOUT_DEGRADED`: use the stable grid fallback and expose the degraded state.
- `CLIENT_CAPACITY_EXCEEDED`: stop at a verified page boundary, report counts and the certified budget, and require a narrower query or a newly certified tier.

## 16. Verification

Focused verification must cover:

- v2 contract validation, stable identities, model-type controls, and bilingual overlays;
- deterministic v1 upgrade and ambiguous-upgrade rejection;
- atomic multi-model change sets, rollback, inbound-reference protection, exact Scope, events, and Outbox;
- composite relationship grouping and entity/field ledger projection;
- subject- and Scope-bound signed cursors;
- catalog and relationship waterline changes before and during page reads;
- `MODEL` boundary entities and complete `SCOPE` topology;
- deterministic component layout, affected-component recomputation, and Worker fallback;
- LOD transitions that preserve semantics, viewport culling, and texture eviction;
- renderer lifecycle, hit testing, context loss, retry, and semantic fallback;
- bilingual UI, keyboard equivalence, compact viewport layout, and non-color indicators;
- browser screenshots, nonblank Canvas checks, zoom, drag, selection, and relationship highlighting;
- measured performance fixtures without claiming unverified production tiers.

WebGL tests use semantic assertions and nonblank Canvas checks. They do not rely on fragile full-frame pixel equality.

## 17. Delivery Increments

1. Data Model v2 contract, localization, validators, compatibility adapter, and atomic MCP change set.
2. Exact-Scope ER repository, dual-waterline read binding, signed pagination, and API contract.
3. Immutable client store, deterministic layout Worker, Pixi renderer, LOD, and recovery.
4. Detail/list integration, global mode, inspector, accessibility, localization, and browser acceptance.
5. ADR, Proposal, Context Pack, contracts, data facts, typed links, evidence, reconciliation, and closure of the same Design Change Session.

Each increment must distinguish designed, implemented, locally verified, and production-certified behavior.

---

# SpecForge WebGL 数据模型 ER 工作区

状态：待书面审阅  
日期：2026-08-20  
所属应用服务：`com.huawei.celon.desiner`  
所属 Scope：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`  
设计变更会话：`design-change-session:7becc74f-cdf5-4512-8c6d-49d885c58f20`

## 1. 问题

当前数据模型详情只显示扁平字段表和自然语言关系列表，无法可靠表达字段所属实体、复合引用中的字段组合，以及字段变更会影响哪些目标。通用资产图使用 React Flow，3A 图使用 Sigma WebGL 普通节点；二者都不能直接表达带字段行和字段端口的 ER 实体。

SpecForge 需要专用且精确 Scope 的 ER 工作区，可查看单个数据模型，也可查看当前应用服务下的全部数据模型。页面必须展示实体、字段、复合关系和跨模型引用，同时不能让浏览器或派生图数据库成为权威来源。

## 2. 目标

- 在数据模型详情页和全局数据模型视图中提供 WebGL ER 工作区。
- 通过统一契约支持当前模型和精确 Scope 两种模式。
- 展示实体及字段的主键、外键、类型、可空、唯一、默认值、约束、分类和负责人。
- 从精确源字段端口连到精确目标字段端口，并支持复合映射。
- 实体、字段和关系改名后仍保持稳定身份。
- 英文为规范内容，面向人的中文覆盖完整。
- 保持 PostgreSQL 权威、MCP-only 写入、Scope 隔离、类型化关系历史和确定性失败行为。
- 支持语义缩放、全拓扑展开、搜索、筛选、检查、无障碍回退和 WebGL 恢复。

## 3. 非目标

- 浏览器不编辑数据模型，写入仍只通过 MCP。
- ER 画布不成为布局或关系的第二权威来源。
- 本增量不开放跨应用服务读取。
- 不根据名称、命名规范或自然语言关系猜测权威外键。
- 未取得实测证据前不宣称企业规模等级。
- 不替换通用资产图、3A 架构图或 NebulaGraph 影响分析投影。

## 4. 选定方案

使用专用 PixiJS WebGL 渲染器显示 ER 记录，并使用基于 ELK 的布局 Worker。React 负责命令、URL 状态、检查器、本地化和语义回退。渲染器只消费不可变 ER 读取 DTO，不直接访问持久化。

Sigma 继续用于现有 3A 图，不用于 ER 图，因为普通图节点不适合可变高度实体、字段行和字段端口。React Flow 保留给现有视图，但不用于全局 ER 画布，避免 DOM/SVG 实体记录限制全拓扑渲染。

## 5. 规范数据模型契约

数据模型 v2 引入不依赖名称的稳定实体、字段和关系 ID。实体和字段分别用 `ordinal` 保持显示顺序，字段只通过 `entityId` 维护一份归属，禁止双份归属数据。概念模型可以只定义实体级关系；逻辑模型可以定义字段映射；物理引用必须具有字段映射，才可以定义约束名和引用动作。

`DataRelation` 包含稳定关系 ID、关系种类、源/目标实体、两端基数、字段映射数组、识别关系、约束名、更新/删除策略、描述和证据。源模型由关系所在的规范 DataModel 隐式确定，不重复存储；强制性由基数下限推导，也不重复存储。字段映射数组完整支持复合外键。

`sourceCardinality` 表示一个目标实例允许关联多少个源实例，`targetCardinality` 表示一个源实例允许关联多少个目标实例。写入校验拒绝概念模型携带物理控制、重复字段映射、不兼容类型、非候选键目标、非空源字段使用 `SET_NULL`，以及没有兼容默认值时使用 `SET_DEFAULT`。

本地化覆盖按稳定实体和字段 ID 建立，不再按名称建立。翻译覆盖不能修改技术身份、类型、可空、键标志和引用动作。

## 6. 关系权威与原子性

完整 `DataRelation` 定义写在源数据模型规范 payload 中，跨模型关系由源模型负责。在同一个 PostgreSQL 事务中，MCP 将其投影为：模型包含实体、实体包含字段、实体级 `REFERENCES` 和每组字段映射对应的字段级 `REFERENCES`。

所有投影关系都携带稳定关系 ID 和来源引用，使实体边与字段边保持为同一个受治理关系组。资产 payload 与关系账本禁止分别编辑。

新增 MCP `apply_data_model_change_set`，原子应用一个或多个数据模型更新，包括嵌入所属源模型的 `DataRelation` 增删，以及资产修订、关系事件和 Outbox。跨模型目标必须从同一精确 Scope 解析，禁止隐式创建不存在的外部端点。

删除仍被活动关系引用的实体或字段时，除非同一变更集删除或迁移所有相关关系，否则失败关闭。任何校验、持久化、账本、修订或 Outbox 失败都回滚整个变更集。

## 7. 旧数据升级

- v1 数据继续通过兼容适配器读取。
- 新数据模型必须使用 v2。
- v1 数据模型发生任何修改前必须升级。
- 单实体 v1 模型可确定性升级。
- 多实体模型字段归属不明确时返回诊断，必须通过 MCP 明确归属。
- 旧自然语言关系只作为备注展示，不能变成权威关系。
- 未归属字段进入独立区域并显示数据质量警告。
- 禁止根据字段名推断外键、所属实体或基数。

## 8. ER 读取契约

Web 页面通过专用读取服务获得 ER 数据，不在浏览器中任意拼装资产 JSON。

- `MODEL`：加载当前数据模型的全部实体，并把其他模型中被引用或引用当前模型的实体作为只读边界实体。
- `SCOPE`：加载当前应用服务 Scope 的全部数据模型、实体和关系拓扑。

客户端 DTO 包含模型分组、实体、字段摘要、完整字段页、结构化关系、字段映射、统计、质量问题和读取绑定。任何写 API 都不得接受该 DTO。

## 9. 一致性读取绑定

读取绑定包含精确应用服务与 Scope、访问主体、模式、根模型、`catalogVersion/catalogDigest`、`relationshipVersion/relationshipDigest`、过期时间和签名密钥 ID。

签名游标复用现有 HMAC Keyring，并绑定访问主体、Scope、模式、根模型和读取绑定。每页读取前后都核对目录及关系双水位；任一变化都使该页失效并返回 `409 SNAPSHOT_CHANGED`。

这是短期乐观一致性绑定，不是长期历史快照。客户端保留有效视图偏好后重新获取绑定，并重新解析之前的选择；已删除对象会被清除并明确提示。

只有关系两端和必要字段映射加载完成后才显示关系边。分页失败时工作区标记为 `PARTIAL`，禁止把部分结果展示成完整结果。

## 10. 渲染架构

工作区拆分为独立的 ER 查询仓库、契约、不可变客户端 Store、布局 Worker、纹理缓存、Pixi 渲染器和 React 工作区。Pixi 使用命令式生命周期与 React 19 解耦；React 只传递不可变快照和命令，不为每个实体或字段创建组件。

## 11. 布局

Worker 先按稳定 ID 排序，再拆分连通分量，计算模型级布局、模型内实体布局、组件装箱和跨模型连线路由。字段只作为实体行和端口，不作为独立布局节点。坐标统一取整以保持稳定。

分页或筛选变化只重排受影响的连通分量。Worker 失败时使用稳定网格回退并标记降级；网格回退不被描述为正式 ER 布局。

拖动位置只是浏览器工作区偏好，以 Scope、模式、根模型和绑定摘要为键，不作为设计事实写入 MCP。

## 12. 语义缩放与渲染预算

“全部展开”表示所选拓扑中的全部模型、实体和关系都进入图中，不表示所有字段文字在每个缩放级别都同时栅格化。

- 远景：模型分组、实体轮廓、关系密度和问题标记。
- 中景：实体名、主键、外键和配置的关键字段。
- 近景：视口内实体的全部字段行和字段端口映射。
- 选中：检查器始终显示完整的已加载事实。

渲染器使用视口裁剪，只为可见实体生成详细纹理，并通过 LRU 回收高精度纹理。远景不分配字段文字纹理，这对中文标签和大字段目录尤其重要。

未验证规模不作承诺。性能证据必须记录硬件、浏览器、模型/实体/字段/关系数量、Payload 大小、查询时间、布局时间、有效首帧、交互帧率、纹理数量和恢复行为。

客户端在分页边界执行基于证据配置的拓扑内存预算。超过已认证预算时返回 `CLIENT_CAPACITY_EXCEEDED`，把已验证页面保留为 `PARTIAL`，报告精确数量并要求缩小查询。被截断的拓扑禁止显示为“全部展开”；提高预算必须提供新的实测证据，不能只修改配置。

## 13. 用户体验

数据模型详情页提供“ER 图 / 字段目录”，ER 图默认当前模型并可切换当前 Scope。数据模型列表页提供“列表 / 全局 ER 图”。两处复用同一个工作区、查询契约、URL 状态和本地化。

工具栏提供模式、搜索、模型/实体/字段、关系种类、分类筛选、适配、重置和布局命令。画布支持平移、缩放、实体拖动固定、选择、关系高亮和源/目标字段导航。

检查器展示身份、模型、实体、字段事实、关系组、复合映射、基数、约束控制、证据和质量问题。紧凑视口使用底部面板，页面采用克制的全宽区域，禁止卡片嵌套。

## 14. 无障碍与本地化

WebGL 不能成为唯一信息表达。搜索结果、实体、字段、关系、加载状态、错误和选择都有语义 DOM 等价内容。键盘用户可从同步列表选择实体或关系，并调用相同的聚焦命令。

WebGL 初始化失败、上下文丢失、纹理预算失败或渲染异常时，保留已加载 Store，切换语义回退，并允许在不重新获取有效页面的情况下重试渲染器。

英文规范字段必填。中文覆盖模型、实体、字段、关系描述、约束说明、质量消息、命令、状态和检查器标签。主键、关系、选择、问题或分类不能只通过颜色表达。

## 15. 错误语义

- `SCOPE_UNAVAILABLE`：失败关闭且不泄露模型是否存在。
- `CURSOR_INVALID`：拒绝错误、篡改、过期或重放游标。
- `SNAPSHOT_CHANGED`：丢弃受影响页并重新建立读取绑定。
- `ENDPOINT_NOT_FOUND`：拒绝新关系；已持久化悬空关系作为质量问题报告。
- `DATA_MODEL_UPGRADE_REQUIRED`：v1 数据未升级前拒绝修改。
- `FIELD_OWNERSHIP_AMBIGUOUS`：拒绝自动升级多实体歧义数据。
- `ACTIVE_REFERENCE_EXISTS`：拒绝删除被引用实体或字段。
- `PARTIAL`：保留已验证页、隐藏不完整关系，并支持从失败游标重试。
- `WEBGL_UNAVAILABLE/WEBGL_CONTEXT_LOST`：切换语义回退并保留查询状态。
- `LAYOUT_DEGRADED`：使用稳定网格并明确显示降级状态。
- `CLIENT_CAPACITY_EXCEEDED`：在已验证分页边界停止，报告数量和认证预算，并要求缩小查询或完成新的规模认证。

## 16. 验证

聚焦验证覆盖 v2 契约、稳定身份、模型层级控制、双语覆盖、v1 升级、原子跨模型变更集、回滚、入站引用保护、精确 Scope、事件、Outbox、复合关系分组、实体/字段账本投影、签名游标、双水位变化、两种查询模式、确定性布局、Worker 回退、LOD、裁剪、纹理回收、渲染生命周期、上下文恢复、语义回退、中英文、键盘等价、紧凑视口和非颜色表达。

浏览器验证包含截图、Canvas 非空检查、缩放、拖动、选择和关系高亮。WebGL 测试使用语义断言和非空 Canvas 检查，不使用脆弱的整帧像素完全相等。

性能夹具必须产生实测报告，未通过的生产等级不得宣称支持。

## 17. 交付增量

1. 数据模型 v2、双语、校验器、兼容适配器和原子 MCP 变更集。
2. 精确 Scope ER 查询、双水位绑定、签名分页和 API 契约。
3. 不可变客户端 Store、确定性 Worker、Pixi 渲染器、LOD 和恢复。
4. 详情/列表集成、全局模式、检查器、无障碍、本地化和浏览器验收。
5. ADR、Proposal、Context Pack、契约、数据事实、类型化关系、Evidence、对账和同一设计会话关闭。

每个增量都必须区分已设计、已实现、本地验证和生产认证。
