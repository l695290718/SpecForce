# Integration Attestation Ledger Consistency Design

## Status

Approved for implementation planning on 2026-08-26. This document corrects the isolation and snapshot-consistency gaps found during review of commit `2a8ba6f`. It does not claim that the correction is implemented.

Implementation preflight session: `design-change-session:ba5c8d00-ad33-46cc-befd-1f93dcb0a5c2`.

Owning architecture Scope:

- `applicationServiceId`: `com.huawei.celon.desiner`
- `scopePath`: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

## Context

ADR-0039 introduced consumer-owned cross-Scope integration contracts and a bounded Integration Atlas. ADR-0041 added evidence-derived verification states by reading legacy `AssetLink` rows with `VALIDATES` relations and selecting the latest linked Evidence asset.

The first implementation has three correctness gaps:

1. Contract, link, and evidence lookup is keyed only by logical ID even though IDs are unique only inside `applicationServiceId + scopePath`.
2. Atlas cursor waterlines include Integration assets but exclude Evidence and `VALIDATES` relationship changes.
3. `VALIDATES` is currently classified as a design-fact relation, so `upsertAssetLink` does not append it to the canonical `RelationshipCurrent` / `RelationshipEvent` ledger. A relationship `graphVersion` therefore cannot detect attestation-link changes until this write path is corrected.

A fourth consistency gap exists between the initial waterline read and the later asset/link reads: a concurrent write can produce one page assembled from different database moments.

## Goals

- Prevent verification evidence from one Scope from changing the state of a same-ID contract in another Scope.
- Make authored catalog and attestation relationship changes invalidate signed Atlas cursors deterministically.
- Keep PostgreSQL relationship events authoritative while retaining `AssetLink` as a compatibility projection.
- Return each Atlas page from one repeatable database snapshot.
- Preserve the existing bounded limits: at most 50 readable Scopes and 500 contracts per page.
- Keep human-facing verification labels bilingual.

## Non-Goals

- Scanner scheduling, continuous attestation, provider acknowledgement, bidirectional reconciliation, and external `APPLY` remain deferred.
- This increment does not introduce a graph-database dependency.
- This increment does not make contract or evidence IDs globally unique.
- This increment does not certify billion-edge production performance.
- This increment does not migrate unrelated design-fact relations unless required by the attestation backfill machinery.

## Decision

### 1. Use Scope-qualified identities everywhere

The Atlas must use the following logical identity for contracts and evidence:

```ts
interface ScopedLogicalIdentity {
  enterpriseId: string;
  applicationServiceId: string;
  scopePath: string;
  logicalId: string;
}
```

An attestation relationship belongs to the same exact application-service Scope as its consumer-owned Integration contract. In-memory maps must use a stable compound key derived from all four fields. Queries must group IDs by Scope and use one Scope-bound predicate per readable Scope; they must never query evidence by unqualified `id IN (...)`.

The enterprise ID is resolved from the same configuration used by the MCP relationship service: `SPECFORGE_ENTERPRISE_ID`, with the existing `legacy-enterprise` compatibility default. Web and MCP code must share this resolver so their defaults cannot diverge.

### 2. Make integration attestations canonical relationship-ledger records

For the exact relation shape `evidence --VALIDATES--> integration`, `link_assets` must atomically:

1. upsert the compatibility `AssetLink` row;
2. upsert the corresponding `AssetNode` endpoints;
3. upsert `RelationshipCurrent` with source `legacy-asset-link` and source reference `legacy-asset-link:<assetLinkId>`;
4. append the matching `RelationshipEvent` and outbox record when effective state changes.

The operation remains idempotent. A replay with no effective relationship change must not advance `graphVersion`. Relationship deletion must mark the current relationship deleted and append its event before the compatibility row is removed.

The Atlas verification reader switches to active `RelationshipCurrent` rows after backfill parity succeeds. `AssetLink` remains available for existing callers but is no longer the authoritative Atlas read source.

### 3. Backfill existing integration attestations before reader cutover

Add an idempotent, exact-Scope backfill command for existing `AssetLink` rows where:

- `sourceType = evidence`
- `targetType = integration`
- normalized `relationType = VALIDATES`

The command must support dry-run and apply modes, report scanned/eligible/upserted/no-op/failed counts, and fail closed on Scope mismatch or ambiguous enterprise ownership. It must reuse the production relationship command service rather than write `RelationshipCurrent` or `RelationshipEvent` directly.

Rollout order:

1. deploy the corrected dual-write path;
2. run the exact-Scope backfill;
3. verify parity between eligible `AssetLink` rows and active canonical relationships;
4. switch the Atlas reader to `RelationshipCurrent`;
5. retain dual write for compatibility.

Reader cutover is blocked if parity is incomplete.

### 4. Bind cursors to a per-Scope version vector

The cursor waterline is the digest of a stable, sorted vector:

```ts
interface AtlasScopeWaterline {
  enterpriseId: string;
  applicationServiceId: string;
  scopePath: string;
  catalogVersion: string;
  relationshipVersion: string;
}
```

- `catalogVersion` comes from `AuthoredCatalogCursor.nextVersion` and covers Integration and Evidence revisions authored through MCP.
- `relationshipVersion` is the maximum `RelationshipEvent.graphVersion` for the exact enterprise and Scope and covers attestation-link upserts and deletions.
- Missing cursor rows resolve to version `0`.
- The vector is sorted by enterprise ID, application-service ID, and scope path before hashing.

A single global maximum is forbidden because changes in one Scope can be hidden by a larger version in another Scope. Any vector change returns `ATLAS_CURSOR_STALE`.

### 5. Read one repeatable snapshot

Waterline validation, Integration reads, active attestation relationship reads, and Evidence reads execute inside one PostgreSQL `REPEATABLE READ` transaction. The next cursor is signed from the version vector observed by that transaction.

The existing two-second Atlas budget still applies. A timeout returns the existing bounded partial response only when the response and continuation cursor were produced from the same snapshot. Database or transaction failures return `ATLAS_UNAVAILABLE`; they must not silently downgrade verified contracts to `UNATTESTED`.

### 6. Select the latest valid Evidence deterministically

Evidence precedence is:

1. parse `recordedAt` to an epoch timestamp;
2. choose the greatest timestamp;
3. break equal-timestamp ties by scoped evidence logical ID.

Lexical timestamp comparison is forbidden because equivalent instants may use different offsets. MCP validation remains responsible for rejecting malformed authored timestamps. A malformed legacy Evidence record is excluded, emits an operational diagnostic, and cannot override a valid Evidence record.

Status mapping remains:

- `passed` -> `ATTESTED`
- `failed` -> `DRIFT`
- `blocked` -> `BLOCKED_ATTESTATION`
- no eligible Evidence -> `UNATTESTED`

Verification state remains derived and is never persisted on the Integration contract.

### 7. Keep the query bounded

Contract IDs and Evidence IDs are grouped by exact Scope. Query predicates are bounded by the existing maximum of 50 readable Scopes rather than by a Scope-by-contract cross product. The page still scans no more than 500 contracts and emits no more than the existing node, edge, payload, and timeout limits.

The implementation may perform a fixed number of grouped queries inside the transaction. It must not issue one query per contract or one query per Evidence asset.

### 8. Localize the complete verification surface

The Atlas drawer uses the existing `integrations.verificationState` message key. Verification-state values use localized labels rather than exposing enum codes as the human-facing label. Stable enum codes may remain in machine-readable API responses and test attributes.

## Read Flow

1. Resolve the authenticated principal, readable application-service Scopes, and configured enterprise ID.
2. Start a `REPEATABLE READ` transaction.
3. Read and hash the sorted Scope waterline vector.
4. Validate cursor subject, active Scope, readable-Scope digest, and waterline digest.
5. Read the bounded Integration page by exact Scope.
6. Read active canonical `VALIDATES` relationships for those Scope-qualified contracts.
7. Read linked Evidence assets by Scope-qualified identity.
8. Derive verification states and build the bounded Atlas response.
9. Sign the continuation cursor with the same transaction's waterline digest.
10. Commit the read transaction and return the response.

## Failure Semantics

- Unauthorized active Scope: `ATLAS_SCOPE_UNAUTHORIZED`.
- Invalid signature, subject, or readable-Scope binding: `ATLAS_CURSOR_INVALID`.
- Changed catalog or relationship vector: `ATLAS_CURSOR_STALE`.
- Backfill parity incomplete during deployment: reader cutover blocked; the currently deployed reader remains active.
- Scope mismatch in relationship or Evidence data: exclude the row, emit a diagnostic, and fail the focused parity check.
- Database or transaction failure: `ATLAS_UNAVAILABLE`.

No error path may reveal another Scope's contract ID, evidence ID, relationship endpoint, or provider locator.

## Testing Strategy

Focused tests must cover:

- same contract ID in two readable Scopes with different Evidence states;
- same Evidence ID in two readable Scopes;
- evidence in an unreadable Scope never affects output or diagnostics returned to the caller;
- Evidence revision advances catalog waterline and invalidates an old cursor;
- attestation upsert and deletion advance relationship waterline and invalidate an old cursor;
- one Scope's version cannot be hidden by another Scope's larger version;
- equivalent timestamps with different offsets order by instant, then scoped ID;
- backfill dry-run, apply, replay no-op, Scope mismatch, and parity failure;
- repeatable-read page construction under a concurrent attestation update;
- Chinese drawer labels contain no hard-coded English verification label;
- existing bounded continuation, redaction, timeout, and payload limits remain unchanged.

At least one PostgreSQL integration test must exercise the real composite uniqueness constraints and relationship event sequence. Mock-only tests are insufficient for the isolation and waterline acceptance criteria.

## Governance and Evidence

The repository decisions remain ADR-0039 and ADR-0041. Implementation must update ADR-0041, its Proposal, Context Pack, Evidence, and typed links through MCP. ADR-0039 is referenced but need not be rewritten unless the bounded Atlas contract changes.

Completion evidence must include exact results for:

- focused Web Atlas tests;
- MCP relationship command tests;
- PostgreSQL attestation backfill/parity integration tests;
- Web and MCP typechecks;
- exact-Scope design-fact synchronization and reconciliation;
- exact-Scope federation reconciliation;
- one live 3010 Atlas read after deployment;
- closure of `design-change-session:ba5c8d00-ad33-46cc-befd-1f93dcb0a5c2` as `CONVERGED`.

Production-scale certification, automated attestation scheduling, and provider acknowledgement remain explicitly deferred.

---

# 集成证明关系账本一致性设计

## 状态

本设计于 2026-08-26 获准进入实施计划编写阶段，用于修正提交 `2a8ba6f` 中发现的 Scope 隔离和快照一致性问题；本文不声明修复已经实现。

实施预检会话：`design-change-session:ba5c8d00-ad33-46cc-befd-1f93dcb0a5c2`。

归属架构 Scope：

- `applicationServiceId`：`com.huawei.celon.desiner`
- `scopePath`：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

## 背景

ADR-0039 引入了消费方归属的跨 Scope 集成契约和有界 Integration Atlas；ADR-0041 通过读取 `AssetLink` 中的 `VALIDATES` 关系及其证据，增加了验证状态。

首版实现存在四个一致性缺口：契约、关系和证据只按逻辑 ID 关联；游标水位没有包含证据和验证关系变化；`VALIDATES` 被归为设计事实关系而未进入规范关系事件账本；水位读取与后续资产读取之间还可能遭遇并发写入，形成混合快照。

## 目标

- 禁止一个 Scope 的证据影响另一个 Scope 中同 ID 契约。
- 让资产和验证关系变化都能确定性地使旧 Atlas 游标失效。
- 保持 PostgreSQL 关系事件权威，`AssetLink` 仅作为兼容投影。
- 每个 Atlas 页面来自同一个可重复读数据库快照。
- 保持最多 50 个可读 Scope、每页最多 500 个契约的既有边界。
- 补齐验证状态的人机界面双语覆盖。

## 非目标

- 扫描调度、持续证明、提供方确认、双向对账和外部 `APPLY` 继续延期。
- 本增量不引入图数据库依赖，不要求契约或证据 ID 全局唯一。
- 本增量不声明十亿关系规模认证。
- 除证明回填机制确有需要外，不迁移无关的设计事实关系。

## 决策

1. 契约、关系和证据统一使用 `enterpriseId + applicationServiceId + scopePath + logicalId` 复合身份；禁止无 Scope 的 `id IN (...)` 证据查询。
2. `evidence --VALIDATES--> integration` 必须在同一事务内写入兼容 `AssetLink`、规范 `RelationshipCurrent`、`RelationshipEvent` 和 Outbox；有效状态未变化的重放不得推进图版本。
3. 为现有 Integration 证明关系提供精确 Scope、可 dry-run、可幂等重放的回填命令；回填对账未通过时禁止切换读取器。
4. Atlas 在回填通过后从活动的 `RelationshipCurrent` 读取证明关系，`AssetLink` 继续保留兼容用途。
5. 游标水位是所有可读 Scope 的版本向量摘要。每个向量项包含企业 ID、应用服务 ID、Scope 路径、目录版本和关系版本；禁止只取全局最大值。
6. 水位、契约、关系和证据读取必须位于同一个 PostgreSQL `REPEATABLE READ` 事务中。
7. `recordedAt` 必须解析成时间戳比较；时间相同再按带 Scope 的证据 ID 决胜，禁止直接按字符串排序。
8. 查询按 Scope 分组，谓词数量受 50 个可读 Scope 限制；禁止逐契约或逐证据查询。
9. 抽屉使用现有 `integrations.verificationState` 国际化键，面向人的状态显示本地化标签，API 仍可保留稳定枚举值。

## 读取流程

1. 解析身份、可读应用服务 Scope 和统一企业 ID。
2. 开启 `REPEATABLE READ` 事务。
3. 读取并计算排序后的 Scope 水位向量摘要。
4. 校验游标的主体、活动 Scope、可读 Scope 摘要和水位摘要。
5. 按精确 Scope 读取有界契约页。
6. 读取这些复合身份契约对应的活动规范 `VALIDATES` 关系。
7. 按复合身份读取证据资产。
8. 推导状态并构造有界 Atlas 响应。
9. 使用同一事务的水位摘要签名下一页游标。
10. 提交只读事务并返回。

## 失败语义

- 无权访问活动 Scope：`ATLAS_SCOPE_UNAUTHORIZED`。
- 签名、主体或可读 Scope 绑定错误：`ATLAS_CURSOR_INVALID`。
- 目录或关系版本向量变化：`ATLAS_CURSOR_STALE`。
- 回填对账不完整：阻止读取器切换，保持当前已部署读取器。
- 关系或证据 Scope 不匹配：排除该记录、记录运维诊断，并让专项对账失败。
- 数据库或事务失败：`ATLAS_UNAVAILABLE`。

任何错误路径都不得泄露其他 Scope 的契约 ID、证据 ID、关系端点或提供方定位器。

## 测试策略

测试必须覆盖同契约 ID 跨 Scope、同证据 ID 跨 Scope、不可读 Scope 隔离、证据和关系变化导致旧游标失效、多 Scope 版本向量、时区等价时间戳排序、回填 dry-run/应用/重放/失败、并发写入下的可重复读快照，以及中文抽屉不再出现硬编码英文标签。

至少一项 PostgreSQL 集成测试必须使用真实复合唯一约束和关系事件序列；仅依赖 Mock 不足以证明隔离和水位验收条件。

## 治理与证据

仓库决策继续由 ADR-0039 和 ADR-0041 承载。实施时必须更新 ADR-0041，并通过 MCP 同步对应 Proposal、Context Pack、Evidence 和有类型关系。只有专项测试、MCP 与 Web 类型检查、精确 Scope 设计事实对账、联邦对账、3010 部署读取和同一设计会话 `CONVERGED` 关闭全部通过后，才能声明完成。

生产规模认证、自动证明调度和提供方确认继续作为延期能力。
