# Graph Verification Fixture Isolation And Cleanup Design

## Status

- Design approved for specification; implementation and deletion have not started.
- Historical data owner: exact Designer application-service Scope.
- Written-design session: `design-change-session:88f1b5ed-aaef-44d0-af22-4626433c0f51`.
- This design authorizes no direct database deletion.
- English is canonical. Chinese is the complete human-facing localization.

## Context

`deploy/graph/live-projection-check.ts` currently defaults its authoring target to the production-like Designer Scope. Three verification runs therefore persisted nine API assets and their `CALLS` links in the authoritative PostgreSQL catalog:

- `specforge-graph-verification-a`
- `specforge-graph-verification-b`
- `specforge-graph-verification-c`
- `specforge-graph-verification-4029a64a45ab42f9aa2321f8d88cfc87-a`
- `specforge-graph-verification-4029a64a45ab42f9aa2321f8d88cfc87-b`
- `specforge-graph-verification-4029a64a45ab42f9aa2321f8d88cfc87-c`
- `specforge-graph-verification-cf7ddbd736d049a6a681009090b59cb9-a`
- `specforge-graph-verification-cf7ddbd736d049a6a681009090b59cb9-b`
- `specforge-graph-verification-cf7ddbd736d049a6a681009090b59cb9-c`

These rows are test fixtures, not design facts. Deleting them before changing the producer would only make the contamination recur. Deleting them directly with Prisma would bypass the MCP write boundary, relationship deletion events, audit behavior, and exact-Scope authorization.

## Goals

- Prevent graph-verification code from writing fixtures into any product-facing application-service Scope.
- Give live projection verification a dedicated application-service-level verification Scope.
- Make fixture lifecycle deterministic across prepare, verify, failure, retry, and cleanup.
- Remove only the nine fingerprint-validated historical fixtures through the audited MCP seed cleanup tool.
- Prove the Designer v5 architecture snapshot remains `4/38/3` and no product design asset is removed.

## Non-Goals

- General-purpose product data deletion.
- Allowing production users or tokens to invoke seed cleanup.
- Changing PostgreSQL authority, relationship-event semantics, or NebulaGraph's derived status.
- Rebuilding or deleting the entire graph database.
- Removing historical append-only audit or relationship events; current fixture relationships become deleted through normal event semantics.
- Performing the v6 semantic-unit expansion in the same implementation session.

## Considered Approaches

### 1. Dedicated verification Scope plus deterministic MCP cleanup

Register an internal verification-only application-service Scope, require the live verifier to target it explicitly, and clean every run through MCP. After producer isolation is proven, remove the nine historical Designer fixtures through the same exact-ID MCP path. This is the selected approach.

### 2. Keep using Designer and clean after every successful run

Rejected because crashes, killed processes, and partial deployments can still leave fixtures in the product catalog.

### 3. Delete historical rows directly in PostgreSQL

Rejected because it bypasses MCP, audit, exact-Scope authorization, relationship deletion events, and graph projection consistency.

## Verification Scope Contract

Introduce a registered application-service Scope with this stable identity:

- Application service ID: `com.huawei.celon.desiner.graph-verification`.
- Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner.graph-verification`.
- Level: `applicationService`.
- Purpose: `verification`.
- Owner: SpecForge Runtime and Test Infrastructure.

The Scope is valid for MCP seed-mode authorization and graph projection, but it is excluded from normal product-facing scope selectors. A `verification` Scope does not inherit a parent module's read or write grant: only an explicit exact-Scope system grant is accepted. Normal user and Agent credentials therefore receive no implicit access. The seed verifier receives an exact read/write grant only while the verification process is running.

`live-projection-check.ts` must require an explicit application service, Scope path, enterprise ID, and run ID. It must fail before opening MCP when:

- any required value is missing;
- the registered Scope purpose is not `verification`;
- the target is `com.huawei.celon.desiner` or another product-facing Scope;
- the supplied application service and Scope path do not match the registry;
- the run ID is empty, `manual`, or contains characters outside the bounded identifier contract.

There is no Designer default and no automatic fallback.

## Fixture Lifecycle

One run owns exactly three fixture asset IDs derived from its validated run ID and exactly two `CALLS` links.

1. `prepare` performs an idempotent cleanup of the same run ID in the verification Scope, then authors the three bilingual assets and two links through MCP.
2. The verifier records the exact Scope, run ID, asset IDs, link IDs, relationship event IDs, graph version, and checkpoint.
3. `verify` proves the two-hop projection, replay idempotency, exact Scope, and checkpoint readiness.
4. `verify` invokes MCP cleanup in a `finally` path. A separate `cleanup` phase provides operator recovery after process termination.
5. Cleanup calls `delete_seed_design_data` with the exact three asset IDs and exact verification Scope. It never passes an empty ID list or a prefix query.
6. Cleanup waits for relationship deletion events to reach the derived projection checkpoint, then confirms the assets and active links are absent.

A verification failure and a cleanup failure are reported separately. If verification passes but cleanup fails, the command exits nonzero, prints the exact retry command and run identity, and remains incomplete until MCP readback proves absence.

## Historical Designer Cleanup

Historical cleanup is a dedicated one-time command and uses the written list of nine IDs. Before deletion it reads every candidate through MCP and validates this complete fingerprint:

- asset type is `api`;
- ID is one of the nine approved IDs;
- path begins with `/internal/specforge-graph-verification/`;
- domain is `domain-graph-verification`;
- canonical description identifies an ephemeral exact-Scope projection fixture;
- the asset has no relationship except the expected fixture-to-fixture `CALLS` links.

Any missing or mismatched fingerprint blocks the entire cleanup. The operation does not partially delete a subset. After validation, one MCP seed cleanup request removes the exact nine assets in the exact Designer Scope. The existing persistence transaction marks related current relationships deleted, appends deletion events/outbox work, and removes the design assets and legacy links atomically.

The cleanup command must be idempotent. A retry after successful deletion reports all nine as already absent and performs no broad delete.

## Data And Projection Consistency

PostgreSQL remains authoritative. The cleanup does not directly mutate NebulaGraph. Relationship deletion events flow through the normal outbox and Projector; verification waits for the corresponding checkpoint before declaring the derived graph clean.

Historical append-only relationship events and audit records remain available as evidence. Current relationship state is `DELETED`; product catalog reads and current graph traversal must not expose active fixture relationships. Asset-node identities may remain as historical technical identities, but they must not appear as active design assets or active traversal results.

## Failure Handling And Recovery

- A product-facing target Scope fails closed before any write.
- A fingerprint mismatch prevents all historical deletion and identifies the mismatched ID without exposing sibling-Scope data.
- An MCP, PostgreSQL, outbox, Projector, or Gateway failure produces a bounded failure receipt with Scope, run ID, completed phase, and retry trigger.
- A cleanup retry is always exact-ID and exact-Scope; no wildcard, prefix delete, raw SQL, or cross-Scope loop is permitted.
- Designer data removal is not considered complete until MCP catalog readback, relationship readback, and the pinned v5 regression check all pass.
- If MCP synchronization cannot persist, repository evidence records `MCP synchronization blocked` and completion is not claimed.

## Verification

- Unit tests prove missing configuration, Designer targeting, product-Scope targeting, inherited parent grants, forged Scope paths, invalid run IDs, and empty cleanup targets fail before writes.
- MCP persistence tests prove exact-Scope deletion, transactionality, relationship lifecycle deletion, outbox emission, and sibling-Scope preservation.
- The live verification Scope test proves `prepare -> verify -> cleanup`, idempotent replay, checkpoint convergence, and zero remaining active fixtures.
- The historical cleanup dry run returns exactly nine fingerprint matches and no additional assets.
- MCP catalog readback confirms all nine historical IDs are absent from Designer and no sibling Scope was read or changed.
- The pinned Designer v5 Baseline remains `PUBLISHED` and queries as 4 units, 38 memberships, and 3 mappings.
- The v5 unit/membership/mapping revision IDs and digests remain unchanged.
- Focused type checks, design-fact reconciliation, and `git diff --check` pass before the implementation session closes.

## Acceptance Criteria

- The live graph verifier cannot target Designer or another product-facing Scope.
- A dedicated verification application service is registered, rejects inherited parent grants, is authorized only through an exact system grant, and is hidden from product scope selectors.
- Every normal verification run cleans its three assets and two links, including the failure path; a recovery cleanup command exists for process termination.
- The nine historical Designer fixtures pass the strict fingerprint and are removed through MCP.
- No other asset, Proposal, Context Pack, or sibling-Scope record changes.
- Current fixture relationships are deleted and the derived projection reaches the deletion checkpoint.
- Designer v5 remains readable as `4/38/3`.
- Repository evidence and MCP operational records contain the exact Scope, IDs, commands, results, and implementation session ID.

## 中文本地化覆盖

### 状态与背景

- 设计已经批准进入书面 Spec；尚未实施，也尚未删除数据。
- 历史数据属于精确 Designer 应用服务 Scope。
- 书面设计会话：`design-change-session:88f1b5ed-aaef-44d0-af22-4626433c0f51`。
- 本设计不授权任何直接数据库删除。

`deploy/graph/live-projection-check.ts` 当前默认把 Designer Scope 作为写入目标，三次验证因此在 PostgreSQL 权威目录中留下 9 条 API 夹具及其 `CALLS` 关系。这些记录是测试数据，不是设计事实。仅删除历史数据会再次污染；直接使用 Prisma 删除又会绕过 MCP、审计、精确 Scope 授权、关系删除事件和图投影一致性。

### 目标与边界

本增量为图投影验证建立独立的应用服务级 Scope：`com.huawei.celon.desiner.graph-verification`，路径为 `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner.graph-verification`，用途标记为 `verification`。它只用于 MCP seed 验证和图投影，不出现在正常产品 Scope 选择器中。验证 Scope 不继承父模块的读写授权，只有验证进程持有的精确系统级 grant 才能访问，因此普通用户和 Agent 不获得隐式权限。

验证脚本必须显式接收企业、应用服务、Scope 路径和运行 ID。缺少参数、Scope 未登记为验证用途、目标为 Designer 或其他产品 Scope、路径不匹配，或者运行 ID 不合法时，都必须在打开 MCP 前失败。系统不再提供 Designer 默认值，也不自动回退。

本增量不是通用删除功能，不开放生产 token 调用 seed 清理，不改变 PostgreSQL 权威性或 NebulaGraph 派生定位，不重建整库，也不与 v6 语义单元扩充共用实施会话。

### 夹具生命周期

每个运行 ID 只拥有 3 个精确资产 ID 和 2 条 `CALLS` 关系。`prepare` 先幂等清理同一运行 ID，再通过 MCP 写入；`verify` 校验两跳投影、重放幂等、精确 Scope 和检查点，并在 `finally` 中调用 MCP 清理。独立 `cleanup` 阶段用于进程被终止后的恢复。

清理只允许向 `delete_seed_design_data` 传递当前运行的 3 个精确 ID 和精确验证 Scope，禁止空列表、前缀删除和通配删除。关系删除事件到达投影检查点后，再确认资产和活动关系均不存在。验证成功但清理失败时命令仍返回失败，并输出精确重试命令；未完成 MCP 回读前不能声明完成。

### 历史清理

Designer 的 9 条历史记录由一次性命令处理。删除前必须通过 MCP 逐条读取并验证完整指纹：类型为 API、ID 位于批准清单、路径属于内部图验证路径、领域为 `domain-graph-verification`、描述明确标识临时投影夹具，并且只存在预期夹具间 `CALLS` 关系。任一指纹不匹配都会阻止全部删除，不能部分处理。

通过验证后，只调用一次 exact-ID、exact-Scope 的 MCP seed 清理。持久化事务原子删除设计资产和旧关系，同时把当前关系标记为删除并产生关系删除事件与 Outbox 工作。重复执行时必须报告 9 条记录已不存在，不能扩大删除范围。

### 一致性与验收

PostgreSQL 继续是权威源；NebulaGraph 只消费删除事件，不接受直接修改。历史追加式关系事件和审计记录保留，当前关系状态变为删除。资产节点身份可以作为历史技术身份保留，但不能再作为活动设计资产或活动遍历结果出现。

验收必须证明验证脚本不能写入任何产品 Scope，独立验证 Scope 不出现在产品选择器中，正常和失败流程均可确定性清理，历史 9 条数据只通过 MCP 删除，其他资产及兄弟 Scope 不变，派生投影到达删除检查点，并且 Designer v5 仍按 4 个单元、38 个成员和 3 条映射读取。仓库证据与 MCP 记录必须保存精确 Scope、ID、命令、结果和实施会话 ID。
