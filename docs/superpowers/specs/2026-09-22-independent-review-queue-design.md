# Independent Review Queue Design

## Status

Accepted direction, rewritten after design review. This specification defines the read-only review-consumption increment that precedes independent decisions and aggregate promotion. It does not approve, reject, promote, reconcile, or publish candidates.

## Goal

Provide an exact-Scope, readiness-gated, snapshot-consistent MCP review queue that allows an authorized independent reviewer to inspect persisted semantic ReviewBundles and bounded candidate evidence without inheriting the scan author's identity or bypassing the existing decision and atomic-promotion gates.

## Scope And Ownership

- Owning application service: `com.specforge.designcenter`.
- Owning Scope path: `pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter`.
- PostgreSQL is authoritative for scan sessions, candidates, ReviewBundles, decisions, review receipts, evidence, and audit events.
- Graph stores are derived projections and are not consulted for authorization, queue completeness, or decision validity.
- The queue accepts only a finalized governed scan session in the exact asserted Scope.
- This increment changes the MCP read contract and independent-review policy; it does not add a Web UI or a new persistence authority.

## Selected Approach And Alternatives

### Selected: MCP Review Queue

Add one provider-neutral, read-only MCP operation named `read_knowledge_review_queue`. Claude Code, OpenCode, future reviewer Agents, and a later Web view consume the same exact-Scope contract.

### Rejected Alternatives

1. **JSON export:** easy to inspect locally, but duplicates authorization and freshness logic, creates uncontrolled evidence copies, and cannot reliably enforce review-set completeness.
2. **Web-only review page:** useful for people, but creates a second read contract and does not support MCP-native reviewers.
3. **Reuse the scan-report payload endpoint:** rejected because source observations and review decisions have different authorization, redaction, pagination, and snapshot semantics.

## Authorization And Reviewer Independence

Queue reads require all of the following:

- exact-Scope authorization for `knowledge:read` and `governance:run`;
- a valid readiness receipt issued to the current actor;
- a finalized scan session in the asserted Scope.

The scan author is not the authorization boundary for queue reads. An authorized reviewer may read a session created by another actor in the same exact Scope. The cursor is bound to the current reviewer actor, not to the scan author.

Decision independence is enforced at the existing `decide_knowledge_review_bundle` boundary:

- T1, T2, and T3 decisions are rejected when the deciding actor equals the scan-session actor or any candidate `generatedByActorId` in the bundle.
- T2 and T3 decisions require `governance:run` and non-empty reviewer evidence.
- T0 retains the existing deterministic-policy behavior and does not weaken any server-derived eligibility rule.
- A Scope-authorized read never implies authority to decide or promote.

Cross-Scope access and unauthorized access return the same non-enumerating error and do not reveal whether a session, bundle, or candidate exists.

## Readiness Gate

Before queue access, the reviewer calls `evaluate_system_knowledge_readiness` with:

- the exact `architectureScope`;
- knowledge profile `DESIGN_CATALOG_CURATION`;
- purpose `independent-semantic-review`;
- a selector containing the requested `scanSessionId`.

`read_knowledge_review_queue` requires `readinessReceiptId`. The server validates that the receipt:

- belongs to the current actor and exact Scope;
- uses profile `DESIGN_CATALOG_CURATION` and purpose `independent-semantic-review`;
- covers the requested scan session selector;
- is unexpired and has not been superseded by a newer evaluation epoch;
- has access decision `ALLOW` and reconciliation state other than blocked.

A missing, denied, expired, stale, actor-mismatched, Scope-mismatched, or selector-mismatched receipt fails closed. `knowledge:diagnostic` remains an explicit diagnostic path and cannot be used to create a review decision or promotion input.

## MCP Request Contract

`read_knowledge_review_queue` accepts:

- `architectureScope`: exact application-service ID and Scope path;
- `readinessReceiptId`: required bounded-read receipt;
- `scanSessionId`: required finalized governed scan session;
- `projection`: `BUNDLES` or `CANDIDATES`;
- `cursor`: optional signed continuation token;
- `pageSize`: optional positive integer;
- `riskTier`: optional `T0`, `T1`, `T2`, or `T3` filter;
- `bundleStatus`: optional ReviewBundle status filter;
- `reviewBundleId`: required for `CANDIDATES`, forbidden for `BUNDLES`.

Server limits are explicit:

- `BUNDLES`: default 50, maximum 100 rows;
- `CANDIDATES`: default 25, maximum 50 rows;
- a value above the maximum is rejected with `REVIEW_QUEUE_PAGE_SIZE_INVALID`; it is not silently widened or clamped;
- the encoded response must not exceed 256 KiB; otherwise the server returns a smaller page with `responseTruncated=true` and a continuation cursor.

## Snapshot And Cursor Contract

The server derives an immutable `reviewSetDigest` from:

- the scan finalization digest;
- the terminal semantic-batch digest;
- sorted ReviewBundle IDs and bundle digests;
- sorted existing decision IDs and decision digests.

Every page returns `reviewSetId`, `reviewSetDigest`, `scanFinalizationDigest`, and `semanticBatchDigest`. A cursor contains and signs:

- cursor version and signing-key version;
- issued-at and expiry timestamps;
- exact Scope and reviewer actor ID;
- readiness receipt ID;
- scan session ID and review-set digest;
- projection, filters, requested page size, and optional bundle ID;
- the last composite sort key.

Cursor lifetime is 15 minutes. Production requires an externally configured cursor-signing secret and key version; a local-development fallback is allowed only outside production.

Ordering is deterministic:

- `BUNDLES`: ascending `reviewBundleId`;
- `CANDIDATES`: ascending `(reviewBundleId, assertionId)`.

If the current review-set digest no longer matches the cursor, the server returns `REVIEW_QUEUE_SNAPSHOT_STALE`. The reviewer must restart from the first page; the server never continues across a changed decision or bundle snapshot.

## Response Contract

Every response includes:

- `reviewQueueReceiptId` and the consumed `readinessReceiptId`;
- bound Scope, scan session ID, projection, filters, and reviewer actor ID;
- `reviewSetId`, `reviewSetDigest`, scan finalization digest, and terminal semantic-batch digest;
- `reviewFreshness`: `CURRENT`, `STALE`, or `BLOCKED`, with stable reason codes;
- page metadata: requested/effective page size, returned count, `hasMore`, and `nextCursor`;
- global unfiltered completeness metadata described below.

`BUNDLES` rows include:

- ReviewBundle ID, risk tier, status, coverage, bundle digest, blocking-issue codes, and evidence-reference counts;
- candidate, identity-candidate, and architecture-fact counts;
- decision summary containing decision ID, decision state, reviewer actor ID, and decision timestamp when present.

`CANDIDATES` rows include only the bounded review projection:

- assertion ID, ReviewBundle ID, asset family, fact type, layer, aspect, semantic identity, confidence, risk tier, and domain cluster;
- identity decision, unresolved questions, evidence-reference counts, source-observation counts, and stable content digest;
- English canonical `name`, `title`, `summary`, and `description` when present;
- Chinese localized `name`, `title`, `summary`, and `description` when present;
- redaction and truncation markers.

The queue does not return the raw assertion `value`, unrestricted source payloads, source credentials, internal database IDs, scanner-local paths beyond already approved evidence references, or arbitrary nested candidate JSON.

## Review-Set Completeness

Filtering must never make a partial result appear complete. Every page includes an unfiltered summary for the whole review set:

- `expectedBundleCount`;
- `expectedBundleIdsDigest`;
- total candidate count;
- bundle counts by risk tier and status;
- decided, undecided, blocked, approved, and rejected counts;
- `allRequiredBundlesDecided`;
- `aggregatePromotionEligible`.

`aggregatePromotionEligible` is server-derived and true only when the complete expected ReviewBundle set has valid decisions and no blocking review-freshness condition. It is informational; promotion revalidates every invariant transactionally.

## Bounded Disclosure And Redaction

The server uses a field allowlist rather than returning arbitrary candidate JSON:

- each localized or canonical text field is limited to 4 KiB UTF-8;
- each unresolved question is limited to 512 bytes and each candidate returns at most 20 questions;
- evidence and source observation identifiers are returned as counts by default; bounded identifiers are included only when already classified as non-sensitive review evidence;
- a candidate row is limited to 16 KiB and a response to 256 KiB;
- truncation is explicit through field-level and response-level markers;
- sensitivity or redaction metadata from the source evidence is honored before rendering candidate content.

Reviewers needing source detail must use the separately authorized bounded scan-report read path with its own readiness receipt and payload policy. The review queue never becomes a raw-source export.

## Review Freshness

Pre-promotion review does not claim reconciliation. `reviewFreshness` is derived from candidate-stage facts:

- `CURRENT`: the finalized scan digest, terminal semantic-batch digest, bundle digests, and current decisions match the response snapshot;
- `STALE`: a newer scan, semantic batch, bundle revision, decision, or readiness epoch supersedes the snapshot;
- `BLOCKED`: coverage, identity, bilingual content, evidence, reviewer independence, or policy rules prevent a valid decision or promotion.

Post-promotion reconciliation remains the responsibility of the existing reconciliation and Baseline publication APIs.

## Audit Behavior

Each successful first-page read creates one immutable review-queue read receipt containing the actor, Scope, readiness receipt, scan session, projection, filters, review-set digest, disclosure counts, and timestamp. Continuation pages reference the same receipt. Audit records contain identifiers and counts, not returned candidate text.

The read operation is otherwise side-effect free: it cannot change candidate, bundle, decision, relationship, ChangeSet, or Baseline state.

## Error Contract

- `REVIEW_QUEUE_ACCESS_DENIED`: permission, Scope, or non-enumerating resource denial.
- `REVIEW_QUEUE_READINESS_REQUIRED`: receipt missing.
- `REVIEW_QUEUE_READINESS_INVALID`: receipt denied, expired, stale, actor/Scope/purpose/profile/selector mismatched, or reconciliation blocked.
- `REVIEW_QUEUE_SESSION_NOT_FINALIZED`: scan session is not in an allowed finalized state.
- `REVIEW_QUEUE_PROJECTION_INVALID`: projection/bundle-ID combination is invalid.
- `REVIEW_QUEUE_PAGE_SIZE_INVALID`: page size is outside the declared range.
- `REVIEW_QUEUE_CURSOR_INVALID`: malformed, tampered, expired, or binding-mismatched cursor.
- `REVIEW_QUEUE_SNAPSHOT_STALE`: cursor snapshot no longer matches the current review-set digest.
- `REVIEW_QUEUE_DISCLOSURE_BLOCKED`: requested content cannot be emitted within sensitivity policy.

Errors must not reveal cross-Scope resource existence.

## Verification

Focused tests must prove:

- exact-Scope authorization and non-enumerating cross-Scope denial;
- an authorized reviewer can read a session created by another actor;
- T1-T3 decisions reject the scan author and every candidate-generating actor;
- readiness receipt binding to actor, Scope, profile, purpose, selector, epoch, and expiry;
- deterministic, non-overlapping keyset pages for both projections;
- cursor binding to snapshot, actor, filters, projection, page size, bundle ID, TTL, and key version;
- snapshot-stale behavior after bundle or decision mutation;
- unfiltered completeness metadata remains stable under filters;
- raw `value`, credentials, and unrestricted source payloads never appear;
- byte and item limits produce explicit truncation behavior;
- successful reads create only bounded audit receipts and no governance-state mutation;
- MCP routing and type-level request/response contracts.

Implementation completion also requires an ADR-0049 update, governed-scan evidence, backlog status, Context Pack update, exact-Scope MCP synchronization, reconciliation read-back, and exact command evidence.

## Non-Goals

- Automatically resolving semantic identity or unresolved questions.
- Approving or rejecting candidates from the read operation.
- Creating typed relationships from candidate evidence.
- Promoting a partial review set.
- Publishing or reconciling a Baseline.
- Returning raw repository content.
- Building a Web UI in this increment.

# 独立审核队列设计

## 状态

方向已确认，并根据设计审查结论完成重写。本规范定义独立决策与聚合提升之前的只读审核消费增量；它不批准、不拒绝、不提升、不对账，也不发布候选。

## 目标

提供精确 Scope、受 readiness 门禁保护、具备一致快照的 MCP 审核队列，使获授权的独立审核者能够检查已持久化的语义 ReviewBundle 和有界候选证据，同时不继承扫描作者身份，也不绕过现有决策与原子提升门禁。

## 范围与权威归属

- 归属应用服务：`com.specforge.designcenter`。
- 归属 Scope 路径：`pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter`。
- PostgreSQL 对扫描会话、候选、ReviewBundle、决策、审核收据、证据和审计事件保持权威。
- 图数据库仅为派生投影，不参与授权、队列完整性或决策有效性判断。
- 队列只接受精确 Scope 下已经最终化的受治理扫描会话。
- 本增量修改 MCP 读取契约与独立审核策略，不增加 Web 页面，也不增加新的数据权威。

## 选定方案与备选方案

### 选定方案：MCP 审核队列

新增一个平台无关的只读 MCP 操作 `read_knowledge_review_queue`。Claude Code、OpenCode、未来审核 Agent 以及后续 Web 页面统一消费同一个精确 Scope 契约。

### 拒绝的备选方案

1. **JSON 导出：** 虽然便于本地查看，但会重复授权和新鲜度逻辑、产生不受控证据副本，也无法可靠强制审核集合完整性。
2. **仅提供 Web 审核页：** 对人类有用，但会产生第二套读取契约，也不能支持 MCP 原生审核者。
3. **复用扫描报告载荷接口：** 来源观察和审核决策需要不同的授权、脱敏、分页与快照语义，因此不复用。

## 授权与审核独立性

队列读取必须同时满足：

- 拥有精确 Scope 的 `knowledge:read` 和 `governance:run` 权限；
- 持有签发给当前 Actor 的有效 readiness 收据；
- 请求精确 Scope 下已经最终化的扫描会话。

扫描作者不是队列读取的授权边界。同一精确 Scope 内获授权的审核者可以读取其他 Actor 创建的扫描会话。游标签名绑定当前审核者 Actor，而不是扫描作者。

审核独立性在现有 `decide_knowledge_review_bundle` 边界强制执行：

- T1、T2、T3 决策中，如果决策 Actor 等于扫描会话 Actor，或等于 Bundle 内任一候选的 `generatedByActorId`，则拒绝决策。
- T2、T3 决策要求 `governance:run` 权限和非空审核证据。
- T0 保留现有确定性策略行为，不弱化任何服务端推导的资格规则。
- 具备 Scope 读取权限不等于具备决策或提升权限。

跨 Scope 和未授权访问使用同一非枚举错误，不泄漏会话、Bundle 或候选是否存在。

## Readiness 门禁

访问队列前，审核者调用 `evaluate_system_knowledge_readiness`，参数为：

- 精确 `architectureScope`；
- 知识 Profile `DESIGN_CATALOG_CURATION`；
- Purpose `independent-semantic-review`；
- 包含目标 `scanSessionId` 的 Selector。

`read_knowledge_review_queue` 强制要求 `readinessReceiptId`。服务端校验该收据：

- 归属于当前 Actor 和精确 Scope；
- Profile 为 `DESIGN_CATALOG_CURATION`，Purpose 为 `independent-semantic-review`；
- 覆盖目标扫描会话 Selector；
- 未过期，且没有被更新的评估 Epoch 替代；
- 访问决策为 `ALLOW`，且对账状态不是阻断状态。

收据缺失、拒绝、过期、陈旧，或 Actor、Scope、Purpose、Profile、Selector 不匹配时全部失败关闭。`knowledge:diagnostic` 只保留为显式诊断路径，不能用于创建审核决策或提升输入。

## MCP 请求契约

`read_knowledge_review_queue` 接受：

- `architectureScope`：精确应用服务 ID 和 Scope 路径；
- `readinessReceiptId`：必填的有界读取收据；
- `scanSessionId`：必填的已最终化受治理扫描会话；
- `projection`：`BUNDLES` 或 `CANDIDATES`；
- `cursor`：可选签名续传令牌；
- `pageSize`：可选正整数；
- `riskTier`：可选 `T0`、`T1`、`T2`、`T3` 过滤条件；
- `bundleStatus`：可选 ReviewBundle 状态过滤条件；
- `reviewBundleId`：`CANDIDATES` 模式必填，`BUNDLES` 模式禁止传入。

服务端限制明确如下：

- `BUNDLES`：默认 50，最多 100 条；
- `CANDIDATES`：默认 25，最多 50 条；
- 超过上限返回 `REVIEW_QUEUE_PAGE_SIZE_INVALID`，不静默放大或截断请求值；
- 编码后的响应不得超过 256 KiB；超限时服务端缩小当前页，并返回 `responseTruncated=true` 和续传游标。

## 快照与游标契约

服务端基于以下内容生成不可变 `reviewSetDigest`：

- 扫描最终化摘要；
- 终态语义批次摘要；
- 排序后的 ReviewBundle ID 与 Bundle 摘要；
- 排序后的现有决策 ID 与决策摘要。

每页返回 `reviewSetId`、`reviewSetDigest`、`scanFinalizationDigest` 和 `semanticBatchDigest`。游标包含并签名：

- 游标版本和签名密钥版本；
- 签发时间和过期时间；
- 精确 Scope 和审核者 Actor ID；
- readiness 收据 ID；
- 扫描会话 ID 和审核集合摘要；
- 投影模式、过滤条件、请求页大小和可选 Bundle ID；
- 上一页最后一个复合排序键。

游标有效期为 15 分钟。生产环境必须配置外部游标签名密钥和密钥版本；本地开发回退只允许在非生产环境使用。

排序规则确定如下：

- `BUNDLES`：按 `reviewBundleId` 升序；
- `CANDIDATES`：按 `(reviewBundleId, assertionId)` 升序。

如果当前审核集合摘要与游标不一致，服务端返回 `REVIEW_QUEUE_SNAPSHOT_STALE`。审核者必须从第一页重新读取；服务端禁止跨越已经变化的决策或 Bundle 快照继续翻页。

## 响应契约

每个响应都包含：

- `reviewQueueReceiptId` 和被消费的 `readinessReceiptId`；
- 绑定的 Scope、扫描会话 ID、投影、过滤条件和审核者 Actor ID；
- `reviewSetId`、`reviewSetDigest`、扫描最终化摘要和终态语义批次摘要；
- `reviewFreshness`：`CURRENT`、`STALE` 或 `BLOCKED`，并附稳定原因码；
- 分页信息：请求/有效页大小、返回数量、`hasMore` 和 `nextCursor`；
- 下文定义的不受过滤影响的全局完整性信息。

`BUNDLES` 行包含：

- ReviewBundle ID、风险等级、状态、覆盖率、Bundle 摘要、阻断原因码和证据引用数量；
- 候选、身份候选和架构事实数量；
- 已存在时返回决策摘要，包括决策 ID、决策状态、审核 Actor ID 和决策时间。

`CANDIDATES` 行只包含有界审核投影：

- Assertion ID、ReviewBundle ID、资产族、事实类型、架构层、方面、语义身份、置信度、风险等级和领域簇；
- 身份结论、未决问题、证据引用数量、来源观察数量和稳定内容摘要；
- 存在时返回英文规范 `name`、`title`、`summary`、`description`；
- 存在时返回中文本地化 `name`、`title`、`summary`、`description`；
- 脱敏与截断标记。

队列不返回原始 Assertion `value`、不受限的来源载荷、来源凭据、数据库内部 ID、超出已批准证据引用范围的扫描器本地路径，也不返回任意嵌套候选 JSON。

## 审核集合完整性

过滤不得让部分结果看起来像完整集合。每一页都包含整个审核集合的不受过滤影响摘要：

- `expectedBundleCount`；
- `expectedBundleIdsDigest`；
- 候选总数；
- 按风险等级和状态统计的 Bundle 数；
- 已决、未决、阻断、批准和拒绝数量；
- `allRequiredBundlesDecided`；
- `aggregatePromotionEligible`。

`aggregatePromotionEligible` 完全由服务端推导，仅当完整预期 ReviewBundle 集合都有有效决策，且不存在审核新鲜度阻断时为真。该字段只用于提示；提升仍需在事务中重新校验全部不变量。

## 有界披露与脱敏

服务端使用字段白名单，不返回任意候选 JSON：

- 每个英文或中文文本字段最多 4 KiB UTF-8；
- 每个未决问题最多 512 字节，每个候选最多返回 20 条；
- 默认只返回证据和来源观察数量；只有已经分类为非敏感审核证据的标识才可有界返回；
- 单候选行最多 16 KiB，单响应最多 256 KiB；
- 字段级和响应级截断都必须显式标记；
- 渲染候选内容前必须遵守来源证据的敏感度与脱敏元数据。

需要来源详情的审核者必须使用独立授权的有界扫描报告读取路径，并持有其自己的 readiness 收据和载荷策略。审核队列不能退化为原始源码导出接口。

## 审核新鲜度

提升前的审核阶段不宣称已经对账。`reviewFreshness` 根据候选阶段事实推导：

- `CURRENT`：已最终化扫描摘要、终态语义批次摘要、Bundle 摘要和当前决策与响应快照一致；
- `STALE`：存在更新的扫描、语义批次、Bundle 修订、决策或 readiness Epoch；
- `BLOCKED`：覆盖率、身份、双语内容、证据、审核独立性或策略规则阻止有效决策或提升。

提升后的对账继续由现有对账和 Baseline 发布 API 负责。

## 审计行为

每次成功读取第一页时创建一条不可变审核队列读取收据，记录 Actor、Scope、readiness 收据、扫描会话、投影、过滤条件、审核集合摘要、披露数量和时间。后续页引用同一收据。审计记录只包含标识和计数，不记录返回的候选正文。

除该有界读取收据外，读取操作没有副作用：不能修改候选、Bundle、决策、关系、ChangeSet 或 Baseline 状态。

## 错误契约

- `REVIEW_QUEUE_ACCESS_DENIED`：权限、Scope 或非枚举资源拒绝。
- `REVIEW_QUEUE_READINESS_REQUIRED`：缺少 readiness 收据。
- `REVIEW_QUEUE_READINESS_INVALID`：收据被拒绝、过期、陈旧，或 Actor、Scope、Purpose、Profile、Selector 不匹配，或对账状态阻断。
- `REVIEW_QUEUE_SESSION_NOT_FINALIZED`：扫描会话不处于允许的最终状态。
- `REVIEW_QUEUE_PROJECTION_INVALID`：投影与 Bundle ID 组合无效。
- `REVIEW_QUEUE_PAGE_SIZE_INVALID`：页大小超出声明范围。
- `REVIEW_QUEUE_CURSOR_INVALID`：游标格式错误、被篡改、已过期或绑定不匹配。
- `REVIEW_QUEUE_SNAPSHOT_STALE`：游标快照不再匹配当前审核集合摘要。
- `REVIEW_QUEUE_DISCLOSURE_BLOCKED`：敏感度策略禁止返回请求内容。

错误不得泄漏跨 Scope 资源是否存在。

## 验证要求

聚焦测试必须证明：

- 精确 Scope 授权和跨 Scope 非枚举拒绝；
- 获授权审核者能够读取其他 Actor 创建的会话；
- T1-T3 决策拒绝扫描作者和所有候选生成 Actor；
- readiness 收据绑定 Actor、Scope、Profile、Purpose、Selector、Epoch 和过期时间；
- 两种投影都具备确定性、无重叠 Keyset 分页；
- 游标绑定快照、Actor、过滤条件、投影、页大小、Bundle ID、TTL 和密钥版本；
- Bundle 或决策变化后返回快照陈旧；
- 过滤条件下全局完整性元数据仍保持稳定；
- 不返回原始 `value`、凭据和不受限来源载荷；
- 字节和条目限制产生显式截断结果；
- 成功读取只创建有界审计收据，不修改治理状态；
- MCP 路由和请求/响应类型契约完整。

实现完成还必须更新 ADR-0049、受治理扫描证据、待办状态和 Context Pack，完成精确 Scope 的 MCP 同步、对账回读并记录精确命令证据。

## 非目标

- 自动解决语义身份或未决问题。
- 通过读取操作批准或拒绝候选。
- 根据候选证据创建类型化关系。
- 提升部分审核集合。
- 发布或对账 Baseline。
- 返回原始仓库内容。
- 在本增量中构建 Web 页面。
