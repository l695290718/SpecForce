# Designer 3A v5 Conservative Membership Expansion Design

## Status

Approved for specification on 2026-08-15. Not implemented. No v5 architecture-fact batch, promotion, Baseline, or projection exists yet.

- Owning application service: `com.huawei.celon.desiner`
- Owning Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Parent decision: `adr-readable-3a-architecture-mapping`
- Current official source Baseline: `knowledge-baseline:designer:3a:v4`
- Written-design session: `design-change-session:4a19af23-3adc-430e-b252-3fead241bb05`

## Objective

Expand the governed Designer 3A Map with design facts that have direct, exact-Scope relationship evidence and unambiguous ownership by an existing architecture unit. The increment must improve coverage without inventing new business, system, or technology semantics.

This is a data-governance increment. It does not change application behavior, database schema, query contracts, projection schema, or Web controls.

## Verified Starting Point

The v4 Baseline is `PUBLISHED` and contains:

- 4 architecture units;
- 28 architecture-unit memberships;
- 3 cross-layer mappings;
- a `READY` projection with `unclassifiedCount=0` inside the authored v4 snapshot;
- exact ownership by the Designer Scope.

The scoped catalog inspection found 23 design assets in the considered API, event, business-rule, state-machine, integration, and observability categories that are not members of v4. All 11 current data models are already represented.

The 23 remaining records are not one homogeneous coverage set:

- 10 have direct typed evidence and can join the existing MCP governance gateway;
- 4 are legitimate facts that require architecture units not present in v4;
- 9 are Nebula projection verification fixtures and are not production architecture facts.

## Decision

Publish a conservative v5 complete snapshot containing the unchanged semantic structure of v4 plus exactly 10 new memberships.

The target v5 content is:

- 4 architecture units;
- 38 architecture-unit memberships;
- 3 cross-layer mappings;
- no new unit identity;
- no new mapping identity;
- no cross-Scope fact;
- no automatic classification based on names or graph communities.

Every new membership belongs to `unit:sys:specforge-mcp-governance-gateway`. The source asset remains the canonical human-facing content; the membership records only the governed assignment, confidence, and evidence references.

## Accepted Membership Matrix

| Source asset | Type | Existing unit | Direct evidence | Rationale |
| --- | --- | --- | --- | --- |
| `api-specforge-asset-link` | API | MCP governance gateway | `api:api-specforge-mcp-tools:contains:api:api-specforge-asset-link`; `api:api-specforge-asset-link:writes:datamodel:data-specforge-asset-graph` | The MCP contract explicitly contains the governed relationship-write API. |
| `event-specforge-asset-link-created` | Event | MCP governance gateway | `event:event-specforge-asset-link-created:emitted_by:api:api-specforge-asset-link` | The event is emitted by a gateway-owned MCP write contract. |
| `event-specforge-design-asset-upserted` | Event | MCP governance gateway | `event:event-specforge-design-asset-upserted:emitted_by:api:api-specforge-asset-upsert` | The event is emitted by an existing gateway member. |
| `event-specforge-mcp-tool-called` | Event | MCP governance gateway | `event:event-specforge-mcp-tool-called:records:datamodel:data-specforge-audit` | The event records execution of the MCP boundary in the authoritative audit model. |
| `rule-specforge-mcp-write-audit` | Business rule | MCP governance gateway | Three `GOVERNS` links to asset, Proposal, and Context Pack upsert APIs | The rule constrains writes already assigned to the gateway. |
| `rule-specforge-relationships-required` | Business rule | MCP governance gateway | `businessrule:rule-specforge-relationships-required:governs:datamodel:data-specforge-asset-graph` plus the asset-link write path | The gateway enforces explicit relationship completeness through its governed link operation. |
| `rule-specforge-seed-through-mcp` | Business rule | MCP governance gateway | `REQUIRES` links to asset-link and asset-upsert APIs | Seed behavior is required to cross the existing MCP write boundary. |
| `integration-specforge-mcp-agent` | Integration | MCP governance gateway | `integration:integration-specforge-mcp-agent:connects_to:api:api-specforge-mcp-tools` | Agent integration terminates at the gateway contract. |
| `sm-specforge-context-pack-generation` | State machine | MCP governance gateway | `statemachine:sm-specforge-context-pack-generation:uses:api:api-specforge-context-pack-upsert` | Lifecycle state is persisted through an existing gateway member. |
| `sm-specforge-proposal-lifecycle` | State machine | MCP governance gateway | `statemachine:sm-specforge-proposal-lifecycle:uses:api:api-specforge-proposal-upsert` | Lifecycle state is persisted through an existing gateway member. |

At implementation time, every source must be re-read through MCP. Missing canonical English, missing Chinese human-facing content, a changed relationship, a non-current asset, or a Scope mismatch removes that source from the batch and blocks the fixed 38-member acceptance count.

## Deferred Semantic Units

The following legitimate assets remain unclassified in v5:

| Asset | Required future unit | Reason for deferral |
| --- | --- | --- |
| `api-specforge-ai-generation` | AI generation service | Its read/write links prove persistence behavior, not ownership by the MCP gateway. |
| `api-specforge-graph-query` | Asset graph query service | It is called by Web and reads the asset graph, but no existing unit accurately represents that system responsibility. |
| `api-specforge-web-console` | Web Console application | Assigning the Web application contract to the MCP gateway would collapse two distinct system boundaries. |
| `obs-specforge-mcp-audit` | Audit observability service | Observing PostgreSQL audit data does not make the observability capability part of the database authority. |

These facts require a separate architecture-unit design with bilingual unit definitions, parent relationships, evidence, mappings where needed, and a new exact-Scope approval. They are not v5 errors.

## Excluded Verification Fixtures

The following nine API records are test/verification artifacts and must not be submitted as v5 architecture members:

- `specforge-graph-verification-a`
- `specforge-graph-verification-b`
- `specforge-graph-verification-c`
- `specforge-graph-verification-4029a64a45ab42f9aa2321f8d88cfc87-a`
- `specforge-graph-verification-4029a64a45ab42f9aa2321f8d88cfc87-b`
- `specforge-graph-verification-4029a64a45ab42f9aa2321f8d88cfc87-c`
- `specforge-graph-verification-cf7ddbd736d049a6a681009090b59cb9-a`
- `specforge-graph-verification-cf7ddbd736d049a6a681009090b59cb9-b`
- `specforge-graph-verification-cf7ddbd736d049a6a681009090b59cb9-c`

Their cleanup is a separate backlog item. The v5 workflow may read and reject them, but it may not delete them or describe the catalog as enterprise-complete.

## Governed Data Flow

1. Open a new implementation `DesignChangeSession`. The written-design session in this Spec does not authorize implementation.
2. Read v4, all 10 candidate assets, their Chinese overlays, and the cited typed links through MCP in the exact Scope.
3. Build a new immutable v5 descriptor. Do not overwrite or repurpose v4 IDs, receipts, evidence, or revision descriptors.
4. Submit one complete-snapshot `ArchitectureFactBatch` through `submit_3a_architecture_fact_batch` with 4 unit revisions, 38 membership revisions, and 3 mapping revisions.
5. Create a T1 Review Bundle. `coverage.complete=true` applies only to the declared v5 evidence set, not the entire enterprise catalog.
6. Approve only the exact revision IDs in the reviewed batch, promote them to the active Designer 3A Working Stream, and reconcile the resulting ChangeSet.
7. Publish immutable `knowledge-baseline:designer:3a:v5` only from the matching converged reconciliation receipt.
8. Request the v5 projection and wait for `READY`; the graph analysis must reach `PUBLISHED`.
9. Read v5 back through MCP and verify exact Scope, 4 units, 38 members, 3 mappings, and zero unclassified members inside the authored snapshot.
10. Close the same implementation session with exact command and result evidence.

PostgreSQL remains authoritative for authored revisions, governance receipts, Baselines, and relationship events. Projection tables and any graph store remain derived and are never authored directly.

## Failure And Recovery

- Missing or changed evidence blocks the affected candidate; it must not be replaced by a naming inference.
- A partial or additive-only batch must be rejected before Baseline publication because it would drop v4 facts from the new projection.
- Revision or idempotency conflicts block the run and require a new reviewed descriptor; existing immutable records are not updated.
- Review blockers, reconciliation drift, Scope mismatch, or missing localization prevent Baseline publication.
- Projection failure leaves v4 immutable and queryable as an official prior Baseline. v5 must not be reported as usable until a `READY` Manifest is read back.
- Retrying the same approved v5 descriptor must be idempotent and return the existing receipts.

## Acceptance Criteria

- MCP reads confirm all 10 source assets and cited links in the exact Designer Scope.
- Canonical English and Chinese human-facing content are complete for all 10 source assets.
- The submitted complete snapshot contains exactly 4 units, 38 memberships, and 3 mappings.
- No excluded fixture or deferred asset appears in the v5 membership revision set.
- Review is `READY`, promotion is approved, reconciliation is `CONVERGED`, Baseline is `PUBLISHED`, projection is `READY`, and derived analysis is `PUBLISHED`.
- MCP read-back returns exact Scope, 4 units, 38 members, 3 mappings, and `unclassifiedCount=0` for the authored snapshot.
- Repository ADR, Evidence, backlog, and implementation notes match the MCP receipts and IDs.
- Focused type checks, design-fact reconciliation, and `git diff --check` pass before the implementation session is closed.

## Non-Goals

- Creating Web Console, AI generation, asset graph query, or audit observability units.
- Cleaning verification fixtures from PostgreSQL.
- Classifying every design asset in the Scope.
- Changing schemas, MCP contracts, Web behavior, projection algorithms, or graph-provider behavior.
- Claiming enterprise-wide 3A completeness.

## Implementation Gate

Implementation must not start until the user explicitly approves this written Spec. After approval, create a separate implementation plan and a new exact-Scope implementation session.

---

# 中文本地化覆盖

## 状态

已于 2026-08-15 批准编写 Spec，尚未实施。目前不存在 v5 架构事实批次、提升、Baseline 或投影。

- 所属应用服务：`com.huawei.celon.desiner`
- 所属 Scope 路径：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 父级决策：`adr-readable-3a-architecture-mapping`
- 当前正式来源 Baseline：`knowledge-baseline:designer:3a:v4`
- 书面设计会话：`design-change-session:4a19af23-3adc-430e-b252-3fead241bb05`

## 目标

把具有直接、精确 Scope 关系证据，并且能明确归属于现有架构单元的设计事实加入 Designer 3A 地图。本增量在不臆造新的业务、系统或技术语义的前提下扩大覆盖。

这是数据治理增量，不改变应用行为、数据库 Schema、查询契约、投影 Schema 或 Web 控件。

## 已核实起点

v4 Baseline 已发布，包含 4 个架构单元、28 个成员归属和 3 条跨层映射；投影为 `READY`，在已编写 v4 快照内 `unclassifiedCount=0`，且精确归属于 Designer Scope。

目录核验发现，在所考察的 API、事件、业务规则、状态机、集成和可观测性类别中，还有 23 个设计资产未加入 v4。当前 11 个数据模型已经全部覆盖。

这 23 条记录不是同一种覆盖对象：10 条有直接类型关系证据，可以加入现有 MCP 治理网关；4 条是真实事实，但需要 v4 中不存在的新架构单元；9 条是 Nebula 投影验证数据，不是生产架构事实。

## 决策

发布保守的 v5 完整快照：保留 v4 的语义结构，并且只增加 10 个成员归属。目标内容为 4 个架构单元、38 个成员归属和 3 条跨层映射，不新增单元身份、不新增映射身份、不写入跨 Scope 事实，也不按名称或图社区自动分类。

10 个新成员全部归属于 `unit:sys:specforge-mcp-governance-gateway`。源资产继续承载面向人的规范内容；成员修订只记录受治理的归属、置信度和证据引用。

## 接受的成员矩阵

| 源资产 | 类型 | 现有单元 | 判定理由 |
| --- | --- | --- | --- |
| `api-specforge-asset-link` | API | MCP 治理网关 | MCP 总契约明确包含关系写入 API，且该 API 写入资产关系图。 |
| `event-specforge-asset-link-created` | 事件 | MCP 治理网关 | 事件由资产关系 MCP 写入契约发出。 |
| `event-specforge-design-asset-upserted` | 事件 | MCP 治理网关 | 事件由已属于网关的资产写入 API 发出。 |
| `event-specforge-mcp-tool-called` | 事件 | MCP 治理网关 | 事件把 MCP 边界执行记录到权威审计模型。 |
| `rule-specforge-mcp-write-audit` | 业务规则 | MCP 治理网关 | 规则治理资产、Proposal 和 Context Pack 写入 API。 |
| `rule-specforge-relationships-required` | 业务规则 | MCP 治理网关 | 网关通过受治理的关系写入操作执行显式关系完整性。 |
| `rule-specforge-seed-through-mcp` | 业务规则 | MCP 治理网关 | 铺底导入被明确要求经过资产和关系 MCP API。 |
| `integration-specforge-mcp-agent` | 集成 | MCP 治理网关 | Agent 集成终止于 MCP 工具契约。 |
| `sm-specforge-context-pack-generation` | 状态机 | MCP 治理网关 | 生命周期状态通过 Context Pack 写入 API 持久化。 |
| `sm-specforge-proposal-lifecycle` | 状态机 | MCP 治理网关 | 生命周期状态通过 Proposal 写入 API 持久化。 |

实施时必须通过 MCP 重新读取每个来源。英文规范字段缺失、中文面向人内容缺失、关系发生变化、资产不是当前版本或 Scope 不匹配时，必须移除对应候选，并阻止固定的 38 成员验收结果。

## 延期语义单元

- `api-specforge-ai-generation` 需要独立的 AI 生成服务单元；读写数据模型并不能证明它属于 MCP 网关。
- `api-specforge-graph-query` 需要资产图查询服务单元；Web 调用和读取资产图只证明交互，不证明现有单元归属。
- `api-specforge-web-console` 需要 Web Console 应用单元；把 Web 应用契约放进 MCP 网关会混淆两个系统边界。
- `obs-specforge-mcp-audit` 需要审计可观测性服务单元；观察 PostgreSQL 审计数据不表示可观测性能力属于数据库权威存储。

这些事实需要独立的架构单元设计，包括双语单元定义、父级关系、证据、必要映射和新的精确 Scope 审批。它们不是 v5 错误。

## 排除的验证数据

9 个 `specforge-graph-verification-*` API 记录属于测试或验证数据，禁止提交为 v5 架构成员。清理工作作为独立待办处理；v5 可以读取并拒绝它们，但不能删除它们，也不能宣称目录已经达到企业级全量覆盖。

## 受治理数据流

1. 新建实施用设计变更会话；本 Spec 的书面设计会话不能授权实施。
2. 通过 MCP 在精确 Scope 内读取 v4、10 个候选、中文覆盖和引用的类型关系。
3. 创建新的不可变 v5 描述，不覆盖或复用 v4 的 ID、回执、证据或修订描述。
4. 通过 MCP 提交完整快照：4 个单元修订、38 个成员修订和 3 个映射修订。
5. 创建 T1 审核包；`coverage.complete=true` 只表示声明的 v5 证据集合完整，不表示企业目录全量完成。
6. 只批准审核包中的精确修订，提升到 Designer 3A 工作流并对账 ChangeSet。
7. 只有匹配的对账回执为 `CONVERGED` 时才发布 `knowledge-baseline:designer:3a:v5`。
8. 请求 v5 投影并等待 `READY`，派生图分析必须达到 `PUBLISHED`。
9. 通过 MCP 回读并核验精确 Scope、4 个单元、38 个成员、3 个映射，以及已编写快照内未分类数为 0。
10. 使用精确命令和结果证据关闭同一实施会话。

PostgreSQL 继续作为已编写修订、治理回执、Baseline 和关系事件的权威来源。投影表及任何图数据库都只是派生数据，禁止直接编写。

## 失败与恢复

- 证据缺失或变化时阻止对应候选，不能用命名推断替代。
- 只有增量而非完整快照的批次必须在 Baseline 发布前被拒绝，避免 v4 事实从新投影中消失。
- 修订或幂等冲突必须阻止运行，并要求新的受审核描述；不能更新现有不可变记录。
- 审核阻塞、对账漂移、Scope 不匹配或本地化缺失都会阻止 Baseline 发布。
- 投影失败时，v4 仍作为正式历史 Baseline 保持不可变且可查询；在读到 `READY` Manifest 前，不得把 v5 描述为可用。
- 使用同一已批准 v5 描述重试必须保持幂等并返回已有回执。

## 验收标准

- MCP 在精确 Designer Scope 内读到全部 10 个来源和引用关系。
- 10 个来源均具备完整英文规范内容和中文面向人内容。
- 完整快照精确包含 4 个单元、38 个成员和 3 个映射。
- v5 成员修订中不含延期资产或验证数据。
- 审核为 `READY`、提升获批、对账为 `CONVERGED`、Baseline 为 `PUBLISHED`、投影为 `READY`、派生分析为 `PUBLISHED`。
- MCP 回读得到精确 Scope、4 个单元、38 个成员、3 个映射和 `unclassifiedCount=0`。
- 仓库 ADR、证据、待办和实施记录与 MCP 回执及 ID 一致。
- 关闭实施会话前，聚焦类型检查、设计事实对账和 `git diff --check` 通过。

## 非目标

- 新建 Web Console、AI 生成、资产图查询或审计可观测性单元。
- 从 PostgreSQL 清理验证数据。
- 分类 Scope 内全部设计资产。
- 修改 Schema、MCP 契约、Web 行为、投影算法或图数据库 Provider。
- 宣称企业级 3A 全量完成。

## 实施门禁

用户明确批准本书面 Spec 前不得开始实施。批准后必须先编写独立实施计划，并新建精确 Scope 的实施会话。
