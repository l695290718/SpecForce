# ADR-0037: WebGL Data Model ER Workspace

## Status

Implemented in the repository for the exact Designer Scope. The shared projection identity utility is browser-safe, the Data Model list and model-level ER views pass fresh exact-Scope browser acceptance, and the Web production build passes with standalone output disabled. The default standalone packaging path remains blocked in this Windows/OneDrive workspace by symlink permissions. No production-scale claim is made.

已在精确 Designer Scope 的仓库代码中实现。共享投影身份工具已改为浏览器兼容实现，数据模型列表页和单模型 ER 页已通过精确 Scope 的现场浏览器验收，关闭 standalone 输出时 Web 生产构建通过；当前 Windows/OneDrive 工作区的默认 standalone 打包仍因符号链接权限受阻。不宣称已达到生产规模。

## Context

The Data Model page previously exposed a flat field table and narrative relationship strings. That representation could not show stable entity and field identities, composite mappings, boundary entities, or a bounded impact path. The browser also needs a read-only view that cannot weaken the MCP-only authoring boundary or application-service isolation.

此前数据模型页面只展示扁平字段表和叙述性关系字符串，无法表达稳定的实体与字段身份、复合映射、边界实体或有界影响路径。浏览器还需要一个只读视图，不能削弱 MCP-only 编写边界或应用服务隔离。

## Decision

1. Use a dedicated PixiJS WebGL ER workspace with an always-available semantic list fallback. ELK-compatible deterministic layout remains bounded by the declared client capacity.
2. Load graph facts through `GET /api/data-model-graph` using the exact application-service Scope and signed dual waterlines. PostgreSQL remains authoritative; graph stores are derived projections only.
3. Add `ER Diagram` and `Field Catalog` views to Data Model detail pages and `List` and `Global ER` views to Data Model list pages. URL state records view, graph mode, root model, filters, and selection.
4. Keep the browser read-only. Data Model v2, stable IDs, composite relations, and atomic MCP change sets remain the authoring contract.
5. Render entities and fields as semantic records and relation mappings as grouped typed edges. Unknown ownership, stale waterlines, partial results, WebGL failure, and layout degradation remain visible states rather than inferred success.

1. 使用专用 PixiJS WebGL ER 工作区，并始终提供语义列表回退。ELK 兼容的确定性布局受声明的客户端容量限制。
2. 通过 `GET /api/data-model-graph` 按精确应用服务 Scope 读取图事实，并绑定签名的双水位。PostgreSQL 保持权威，图数据库只能是派生投影。
3. 数据模型详情页增加“ER 图”和“字段目录”，数据模型列表页增加“列表”和“全局 ER”。URL 状态记录视图、图范围、根模型、过滤器和选择项。
4. 浏览器保持只读。数据模型 v2、稳定 ID、复合关系和原子 MCP 变更集保持为写入契约。
5. 实体与字段以语义记录展示，关系映射以分组的有类型边展示。未知归属、过期水位、部分结果、WebGL 失败和布局降级都必须以显式状态呈现，不得推断为成功。

## Consequences

The page can explain field-level relationships and keep the current Scope visible while preserving the existing list and field catalog. Large graphs degrade to a verified semantic subset or fallback state; this is an operational contract, not an assertion of unlimited browser capacity. Existing v1 models remain readable but require an MCP upgrade before mutation.

页面可以解释字段级关系，并在保留现有列表和字段目录的同时保持当前 Scope 可见。大型图谱会降级为已验证的语义子集或回退状态；这是运行契约，不是浏览器无限容量的声明。现有 v1 模型仍可读取，但变更前必须通过 MCP 升级。

## Alternatives

- Reuse the generic React Flow asset graph: rejected because it does not model field-bearing ER cards and composite mappings directly.
- Use Sigma.js for the ER surface: rejected for this slice because the existing Sigma workspace is optimized for architecture facts, while ER cards need imperative field-row rendering and a dedicated fallback.
- Make the browser an authoring client: rejected because MCP is the only write boundary.

## Verification and Boundary

The implementation evidence must record focused tests, web typecheck, web build, manifest checks, federation checks, and an exact-Scope browser inspection when available. If an environment cannot provide a fresh browser inspection or MCP read-back, the result must remain pending or blocked with a retry trigger. Production capacity, external identity, continuous synchronization, and graph-store scale certification are deferred.

实现证据必须记录聚焦测试、Web 类型检查、Web 构建、manifest 校验、联邦校验，以及条件允许时的精确 Scope 浏览器检查。如果环境无法提供新的浏览器检查或 MCP 回读，结果必须保持待验证或阻塞，并记录重试触发条件。生产容量、外部身份、持续同步和图存储规模认证延期处理。

## 中文本地化覆盖

### 标题

有边界、支持字段关系的 WebGL 数据模型 ER 工作区

### 状态

已在精确 Designer Scope 的仓库代码中实现。共享投影身份工具已改为浏览器兼容实现，数据模型列表页和单模型 ER 页已通过精确 Scope 的现场浏览器验收，关闭 standalone 输出时 Web 生产构建通过；当前 Windows/OneDrive 工作区的默认 standalone 打包仍因符号链接权限受阻。不宣称已达到生产规模。

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
