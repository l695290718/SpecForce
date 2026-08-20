# ADR-0037: WebGL Data Model ER Workspace

## Status

Implemented in the repository for the exact Designer Scope. The field-bearing entity cards, field-port relationships, bounded labels, camera controls, entity dragging, exact-Scope local position restoration, bilingual semantic fallback, inspector, complete cursor-page aggregation, and stale-ledger suppression are implemented. The current MCP catalog contains 12 v2 self-design models, 40 entities, and 79 fields; legacy ambiguous field ownership is rejected instead of silently attached. Focused tests and Web typecheck pass. No production-scale claim is made.

已在精确 Designer Scope 的仓库代码中实现。带字段行的实体表卡片、字段端口关系、有界标签、画布相机控制、实体拖拽、精确 Scope 本地位置恢复、双语语义回退、检查器、完整游标分页聚合和旧账本过滤已经实现。当前 MCP 目录包含 12 个 v2 自设计数据模型、40 个实体和 79 个字段；未知字段归属会被拒绝，不会静默挂载。聚焦测试和 Web 类型检查通过；不宣称已达到生产规模。

## Corrective Clarification (2026-08-20)

The renderer must project flat model, entity, and field facts into draggable entity cards with ordered field rows. Structured field mappings anchor edges to exact field ports; entity-only relationships without mappings anchor to card headers and expose `FIELD_MAPPING_UNCONFIGURED`. Dragged positions are exact-Scope browser preferences, never authored facts. The complete approved behavior and acceptance criteria are recorded in `docs/superpowers/specs/2026-08-20-field-anchored-draggable-er-cards-design.md`.

## 纠偏说明（2026-08-20）

渲染器必须把扁平的模型、实体和字段事实投影为带有序字段行的可拖拽实体表卡片。结构化字段映射必须锚定到精确字段端口；没有映射的实体关系连接表头并显示 `FIELD_MAPPING_UNCONFIGURED`。拖拽位置只是精确 Scope 下的浏览器偏好，绝不是已编写设计事实。完整的已确认行为与验收标准记录在 `docs/superpowers/specs/2026-08-20-field-anchored-draggable-er-cards-design.md`。

## Context

The Data Model page previously exposed a flat field table and narrative relationship strings. That representation could not show stable entity and field identities, composite mappings, boundary entities, or a bounded impact path. The browser also needs a read-only view that cannot weaken the MCP-only authoring boundary or application-service isolation.

此前数据模型页面只展示扁平字段表和叙述性关系字符串，无法表达稳定的实体与字段身份、复合映射、边界实体或有界影响路径。浏览器还需要一个只读视图，不能削弱 MCP-only 编写边界或应用服务隔离。

## Decision

1. Use a dedicated PixiJS WebGL ER workspace with an always-available semantic list fallback. ELK-compatible deterministic layout remains bounded by the declared client capacity.
2. Load graph facts through `GET /api/data-model-graph` using the exact application-service Scope and signed dual waterlines. PostgreSQL remains authoritative; graph stores are derived projections only.
3. Add `ER Diagram` and `Field Catalog` views to Data Model detail pages and `List` and `Global ER` views to Data Model list pages. URL state records view, graph mode, root model, filters, and selection.
4. Keep the browser read-only. Data Model v2, stable IDs, composite relations, and atomic MCP change sets remain the authoring contract.
5. Render entities and fields as semantic records and relation mappings as grouped typed edges. Unknown ownership, stale waterlines, partial results, WebGL failure, and layout degradation remain visible states rather than inferred success.
6. Keep field rows visible through normal working zoom, bound long model/entity/field labels to card and canvas dimensions, and expose explicit zoom controls plus pointer-based canvas pan. The complete graph reader follows signed cursors and refuses a changed waterline.
7. Treat Data Model v2 `entityId` as the only authored field ownership source. For authored v2 models, stale ledger entity/field nodes and relationship rows are suppressed; for ambiguous legacy ownership, the projection emits `FIELD_OWNERSHIP_AMBIGUOUS` and renders no guessed field attachment.

1. 使用专用 PixiJS WebGL ER 工作区，并始终提供语义列表回退。ELK 兼容的确定性布局受声明的客户端容量限制。
2. 通过 `GET /api/data-model-graph` 按精确应用服务 Scope 读取图事实，并绑定签名的双水位。PostgreSQL 保持权威，图数据库只能是派生投影。
3. 数据模型详情页增加“ER 图”和“字段目录”，数据模型列表页增加“列表”和“全局 ER”。URL 状态记录视图、图范围、根模型、过滤器和选择项。
4. 浏览器保持只读。数据模型 v2、稳定 ID、复合关系和原子 MCP 变更集保持为写入契约。
5. 实体与字段以语义记录展示，关系映射以分组的有类型边展示。未知归属、过期水位、部分结果、WebGL 失败和布局降级都必须以显式状态呈现，不得推断为成功。
6. 正常工作缩放范围内保持字段行可见；长模型名、实体名和字段名必须受卡片与画布尺寸约束，并提供明确的缩放控件和基于指针的画布平移。完整图读取器必须跟随签名游标，并拒绝水位变化。
7. 将数据模型 v2 的 `entityId` 作为唯一的字段归属事实。对于已编写的 v2 模型，过滤掉旧账本实体、字段节点和关系行；对于字段归属不明确的旧模型，投影必须发出 `FIELD_OWNERSHIP_AMBIGUOUS`，不得猜测挂载字段。

## Consequences

The page can explain field-level relationships and keep the current Scope visible while preserving the existing list and field catalog. Large graphs degrade to a verified semantic subset or fallback state; this is an operational contract, not an assertion of unlimited browser capacity. Existing v1 models remain readable but require an MCP upgrade before mutation.
The migration is an explicit MCP operation, not a browser-side write. It is idempotent by migration key and must be rerun after restoring a database snapshot that predates the v2 field ownership facts.

页面可以解释字段级关系，并在保留现有列表和字段目录的同时保持当前 Scope 可见。大型图谱会降级为已验证的语义子集或回退状态；这是运行契约，不是浏览器无限容量的声明。现有 v1 模型仍可读取，但变更前必须通过 MCP 升级。
迁移是显式的 MCP 操作，不是浏览器写入。迁移键保证幂等；如果恢复到没有 v2 字段归属事实的数据库快照，必须重新执行迁移。

## Alternatives

- Reuse the generic React Flow asset graph: rejected because it does not model field-bearing ER cards and composite mappings directly.
- Use Sigma.js for the ER surface: rejected for this slice because the existing Sigma workspace is optimized for architecture facts, while ER cards need imperative field-row rendering and a dedicated fallback.
- Make the browser an authoring client: rejected because MCP is the only write boundary.

## Verification and Boundary

The implementation evidence must record focused tests, web typecheck, web build, manifest checks, federation checks, and an exact-Scope browser inspection when available. The current 3000 browser inspection is blocked by the browser URL policy after the service restart; the rebuilt 3010 Docker service is healthy but its browser interaction acceptance is still pending. Retry when the in-app browser can access the restarted local URL.

实现证据必须记录聚焦测试、Web 类型检查、Web 构建、manifest 校验、联邦校验，以及条件允许时的精确 Scope 浏览器检查。当前 3000 端口重启后的浏览器检查被 URL 安全策略阻塞；重建后的 3010 Docker 服务已健康，但浏览器交互验收仍待执行；应在应用内浏览器可以访问重启后的本地 URL 后重试。生产容量、外部身份、持续同步和图存储规模认证延期处理。

## 中文本地化覆盖

### 标题

有边界、支持字段关系的 WebGL 数据模型 ER 工作区

### 状态

已在精确 Designer Scope 的仓库代码中部分实现。精确 Scope 读取、扁平图存储、基础布局和 WebGL 画布已完成浏览器验证；字段表卡片、字段端口连线、相机交互、实体拖拽、刷新位置恢复和完整检查器仍待实现。不宣称已达到生产规模。

### 上下文

数据模型页面此前只展示扁平字段表和叙述性关系字符串，无法表达稳定的实体与字段身份、复合映射、边界实体或有界影响路径。浏览器还需要一个只读视图，不能削弱 MCP-only 编写边界或应用服务隔离。

### 决策

采用有界 PixiJS WebGL ER 工作区、语义列表回退、精确 Scope 图读取、双水位绑定和 MCP-only 编写边界。数据模型详情页提供 ER 图与字段目录，数据模型列表页提供列表与全局 ER，URL 保留视图、图范围、根模型、过滤器和选择项。实体与字段以语义记录展示，关系映射以分组的有类型边展示；未知归属、过期水位、部分结果、WebGL 失败和布局降级都以显式状态呈现。

### 备选方案

- 复用通用 React Flow 资产图：拒绝，因为它不能直接表达带字段行的 ER 卡片和复合映射。
- 使用 Sigma.js 作为 ER 表面：本增量拒绝，因为现有 Sigma 工作区面向架构事实，而 ER 卡片需要命令式字段行渲染和专用回退。
- 让浏览器成为编写客户端：拒绝，因为 MCP 是唯一设计事实写入边界。

### 后果

页面可以解释字段级关系，并在保留列表和字段目录的同时保持当前 Scope 可见。大型图谱会降级为已验证的语义子集或回退状态；这是运行契约，不是浏览器无限容量声明。现有 v1 模型仍可读取，但变更前必须通过 MCP 升级。

### 约束

- PostgreSQL 对已编写设计资产和关系事件保持权威，图数据库只能是派生投影。
- 禁止跨 Scope 聚合，查询必须绑定精确应用服务 Scope。
- 英文规范字段和完整中文覆盖是治理写入前提。
- 生产容量、外部身份、持续同步和图存储规模认证延期，必须用新的证据单独取证。

## Governance IDs

- ADR: `adr-webgl-data-model-er-workspace`
- Proposal: `proposal-webgl-data-model-er-workspace`
- Context Pack: `ctx-webgl-data-model-er-workspace`
- API: `api-specforge-data-model-graph-query`
- Scope: `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
