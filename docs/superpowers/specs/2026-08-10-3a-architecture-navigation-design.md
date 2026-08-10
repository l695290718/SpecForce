# SpecForge 3A Architecture Navigation Workspace

## English Canonical Design

### 1. Status And Traceability

This revision resolves the architecture-review findings. The product direction is approved; written-spec approval is still required before implementation planning.

- Owning application service: `com.huawei.celon.desiner`
- Owning scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Design Change Session: `design-change-session:882fb4fb-cd55-4bba-a75c-d05c1d01b7bc`
- Proposed ADR ID: `adr-3a-architecture-navigation-workspace`
- Proposed Proposal ID: `proposal-3a-architecture-navigation-workspace`
- Proposed Context Pack ID: `ctx-3a-architecture-navigation-workspace`
- Related decisions: `adr-deterministic-3a-knowledge-projections`, `adr-application-service-scope-isolation`, `adr-mcp-first-architecture`, `adr-postgresql-authoritative-design-store`

After written approval, the proposed ADR, Proposal, Context Pack, Evidence, backlog facts, and directional typed links must be persisted through MCP in this exact Scope. The current design session closes only after repository and MCP records reconcile. Implementation then opens a new exact-Scope session.

### 2. Problem And Product Decision

SpecForge can derive deterministic BIZ, SYS, and TECH projections, cross-layer alignment, drift, and a pinned Context Pack. The Web console has no productized 3A browser. The generic asset graph cannot substitute for a Baseline-bound architecture view.

The product decision is a read-only, business-first architecture navigation workspace at `/architecture/3a`. It shows one authorized application-service Scope and one published Baseline. It starts from a focused path rather than an entire graph, supports search from any layer, and permits bidirectional tracing.

The first delivery uses PostgreSQL only. The existing NebulaGraph projection contains design-asset identities, not Baseline-bound Knowledge Assertions, so it cannot provide semantically equivalent 3A traversal. A dedicated 3A graph projection and Nebula Reader are a separately governed increment.

### 3. Goals

- Trace business intent through system realization to technical implementation and back.
- Read only facts belonging to an explicitly selected `PUBLISHED` Baseline.
- Preserve exact tenant and application-service authorization for every node, edge, count, and continuation.
- Use deterministic, bounded, resumable queries rather than whole-graph rendering.
- Show explicit typed alignment, Baseline-to-Baseline drift, Evidence, and accepted identity mappings.
- Reuse one query contract for Web and MCP read clients.
- Keep all formal mutations behind MCP.

### 4. Non-goals

- Web editing, review, promotion, approval, or Baseline publication.
- Cross-application-service comparison or aggregation.
- Inferred relationships based on names, layout, or model-generated similarity.
- NebulaGraph-backed 3A traversal in the first delivery.
- Whole-Scope or billion-edge browser rendering.
- Production IdP delivery, external connectors, automatic promotion, outbound Proposal, external `APPLY`, or new AI generation.
- A claim that billion-scale capacity has been certified. The design is bounded and horizontally extensible; certification remains separate evidence.

### 5. Delivery Decomposition

#### Increment A: PostgreSQL 3A Browser

This Spec and its future implementation plan cover:

- explicit Profile binding in a v2 Projection Manifest;
- resumable PostgreSQL materialization and atomic publication of Baseline-bound projection nodes and edges;
- a shared, exact-Scope 3A query package;
- PostgreSQL Baseline snapshot reads;
- signed search cursors and server-held traversal continuations;
- request-principal resolution with a seed-only development adapter;
- Web navigation, lanes, list fallback, Alignment, Drift, detail, and failure states;
- equivalent MCP read tools;
- focused verification and MCP design-fact synchronization.

#### Increment B: 3A Graph Projection

This remains a backlog fact owned by SpecForge Runtime. Its trigger is successful acceptance and query telemetry from Increment A. It requires a separate ADR and must define Knowledge Assertion vertices, versioned relationship edges, Baseline membership or as-of semantics, Outbox events, checkpoint namespaces, rebuild behavior, and PostgreSQL/Nebula parity evidence. It is not part of the first implementation plan.

### 6. Route And User Experience

Add `3A Architecture` / `3A 架构` after Workspace and before Design Assets. The route is `/architecture/3a`.

The URL stores shareable architecture state:

- `scope`: required application-service ID;
- `baseline`: published Baseline ID; default is selected deterministically by `publishedAt DESC, id ASC`;
- `projection`: v2 Projection Manifest ID that fixes Profile and projection schema;
- `focus`: Knowledge Assertion ID;
- `tab`: `architecture`, `alignment`, or `drift`;
- `mode`: `lanes` or `list`;
- `direction`: `upstream`, `downstream`, or `both`.

Locale continues to use the existing cookie and local-storage mechanism. API reads may accept the existing optional `locale` parameter, but locale is not required in shareable architecture URLs and never changes canonical content.

#### Default flow

1. Resolve the request principal and exact Scope before any data-dependent query.
2. Resolve the requested published Baseline or the deterministic latest published Baseline.
3. Resolve a compatible v2 Projection Manifest for the configured default Profile, or use the explicit `projection` value.
4. Open a paginated BIZ catalog without loading relationships.
5. Search or select a fact from any layer.
6. Render the selected fact and its first bounded cross-layer path in BIZ, SYS, and TECH lanes.
7. Expand individual branches through continuation tokens or select another node as focus.
8. Inspect facts, Evidence, typed links, accepted identity mappings, and projection metadata in a right-side drawer.

The page is read-only. It contains navigation links but no mutation controls.

### 7. Page Components

- `ThreeAWorkspace`: owns URL state, selected Baseline, selected projection, tab, mode, focus, and history.
- `BaselineToolbar`: shows Scope, Baseline, Profile/version, search, tabs, and view mode.
- `ArchitectureLanes`: renders stable BIZ, SYS, and TECH lanes.
- `ArchitectureNode`: renders canonical and localized names, fact type, confidence, and completeness indicators.
- `ArchitectureEdge`: renders direction, relationship code, confidence, and truncation frontier.
- `ArchitectureDetailDrawer`: renders read-only fact, Evidence, relationships, revisions, questions, and linked assets.
- `AlignmentView`: groups explicit cross-layer alignment and unaligned facts.
- `PublishedBaselineDriftView`: compares two published Baselines.
- `ArchitecturePathList`: keyboard-friendly and mobile fallback for the same result.
- `ProjectionStateBanner`: renders typed empty, lag, truncation, authorization, and availability states.

The lane view uses stable node dimensions and anchored focus placement. Mobile defaults to list mode. A large result may offer list mode but cannot silently omit nodes that were returned by the query.

### 8. Shared Module Boundaries

No application may import another application's internal persistence code.

#### `@specforge/core`

Owns pure domain contracts:

- `ProjectionManifestV2` with explicit `profileId`, `profileVersion`, and `projectionSchemaVersion`;
- Baseline-bound `KnowledgeProjectionNode` and `KnowledgeProjectionEdge` contracts;
- projection-generation lifecycle, canonical build-key, and publication invariants;
- `PublishedBaselineDrift` with `baseBaselineId` and `targetBaselineId`;
- validation, stable ordering, digest rules, and DTO value objects.

#### `@specforge/knowledge-query`

New package that owns:

- `ThreeAProjectionQueryService`;
- repository and principal-policy interfaces;
- query DTOs and typed errors;
- search cursor signing and validation;
- traversal continuation policy;
- PostgreSQL repository adapter with an injected Prisma-compatible client.

The package creates no global database client and performs no authored writes.

#### Web adapter

`apps/web` resolves the request principal, instantiates the shared service, maps URL state, and renders DTOs. Page components never call Prisma directly.

#### MCP adapter

`apps/mcp-server` exposes equivalent read tools over the same service and passes its normalized `ScopedPrincipal`. MCP remains the only formal write boundary.

### 9. Manifest And Baseline Semantics

The Baseline remains Profile-neutral. Profile identity belongs to the derived projection.

`ProjectionManifestV2` requires:

- exact `architectureScope`;
- `baselineId`;
- `profileId` and `profileVersion`;
- `projectionSchemaVersion = 3a.v2`;
- sorted `sourceRevisionIds`;
- `relationshipVersion`;
- canonical query definition;
- canonical input digest, generation ID, lifecycle status, completion counts, content digest, and timestamps.

The lifecycle is `BUILDING -> READY` or `BUILDING -> FAILED`. The canonical build key is the digest of exact Scope, Baseline, Profile ID/version, projection-schema version, sorted source revisions, relationship version, and normalized query definition. Runtime status, timestamps, and database-generated IDs are excluded from that digest.

Schema migration adds nullable Profile columns to preserve existing rows. Legacy manifests are never guessed or silently backfilled. The 3A browser accepts only v2 manifests with explicit Profile binding. An existing Baseline without a compatible v2 manifest returns `PROJECTION_MANIFEST_REQUIRED`. A separately evidenced MCP derive operation creates the required v2 manifest.

The v2 MCP derive operation selects Baseline assertions using the existing deterministic rule: accepted assertions explicitly listed by the Baseline or accepted assertions bound to the Baseline ChangeSet. It reconstructs typed relationships as of `BaselineManifest.relationshipVersion` from append-only `RelationshipEvent` snapshots; it must not use a newer mutable `AssetLink` state as a historical Baseline.

The derive operation then resolves each explicit relationship endpoint to an assertion in the same Baseline using the typed relationship assertion, promoted asset `knowledgeRevision.sourceAssertionId`, and accepted identity decisions. Missing or ambiguous endpoint resolution fails with `PROJECTION_ENDPOINT_UNRESOLVED` or `PROJECTION_ENDPOINT_AMBIGUOUS`; it never fans out a guessed edge.

The derive operation acquires a build lease for the canonical build key, creates a `BUILDING` generation, and writes the following derived read model in bounded batches:

- `KnowledgeProjectionNode`: exact Scope, Manifest, Baseline, assertion ID, semantic identity, layer, stable sort key, optional accepted asset reference, and content digest;
- `KnowledgeProjectionEdge`: exact Scope, Manifest, Baseline, relationship event/assertion reference, source assertion ID, target assertion ID, relation code, confidence, relationship version, and content digest.

After all batches are written, a short PostgreSQL transaction validates endpoint closure, row counts, and the canonical content digest, then marks the generation `READY`. Readers never observe `BUILDING` or `FAILED` generations. A failed build is marked `FAILED` with a sanitized reason and retry reference; expired builds are removed by retention policy. A repeated derive request with the same build key returns the existing `READY` generation, resumes its own valid `BUILDING` generation, or fails on a conflicting digest. It never deletes or mutates a `READY` generation.

These rows are derived, immutable after publication, and rebuildable from authoritative facts. The browser Reader queries only a pinned `READY` materialization and joins authoritative assertion, Evidence, and localization details by exact Scope. Web requests do not reconstruct historical relationship state on every interaction. This staged publication avoids a transaction whose duration grows with the Baseline while retaining atomic reader visibility.

### 10. Query Contract

| Operation | Result | Authorization |
| --- | --- | --- |
| `listPublishedBaselines` | deterministic Baseline summaries | tenant and exact Scope read grant |
| `listProjectionManifests` | compatible `READY` v2 manifests for a Baseline | tenant, exact Scope, Baseline |
| `searchArchitectureFacts` | ordered BIZ/SYS/TECH facts and search cursor | tenant, exact Scope, Baseline, projection |
| `traceArchitecturePath` | bounded nodes, edges, frontier, continuation | tenant, exact Scope, Baseline, projection |
| `getArchitectureFactDetail` | fact, localization, Evidence, relationships, and accepted asset mapping | tenant, exact Scope, Baseline, projection |
| `getArchitectureAlignment` | explicit alignment and unaligned facts | tenant, exact Scope, Baseline, projection |
| `comparePublishedBaselines` | `ADDED`, `REMOVED`, `CHANGED`, `UNCHANGED` | tenant, exact Scope, two published Baselines and two compatible projections |

Every DTO returns `applicationServiceId`, `scopePath`, `baselineId`, `projectionManifestId`, `profileId`, `profileVersion`, `relationshipVersion`, and a deterministic result digest. The server validates both endpoints of every relationship before returning it.

Evidence references resolve only to same-Scope Evidence. Design-asset links resolve only through an `ACCEPTED` identity decision reached from the assertion's source observations. Missing or rejected identity mappings remain visible as completeness warnings and do not create links.

### 11. Cursor And Query Budgets

There is no product-wide total-hop limit, but every request is finite.

Default request budget:

- `maxDepth = 2`;
- `maxNodes = 200`;
- `maxEdges = 400`;
- `maxPaths = 100`;
- `timeoutMs = 2000`;
- `maxPayloadBytes = 524288`.

Server policy may lower these values. The first delivery hard-caps one request at depth 5, 1,000 nodes, 2,000 edges, 1,000 paths, 5 seconds, and 2 MiB. These are safety limits, not capacity certification.

Search uses a signed, opaque, stateless cursor containing version, tenant, Scope digest, Baseline, projection, normalized filter digest, final sort key, expiry, and key ID.

Traversal uses a signed token containing only `browseSessionId`, sequence, state digest, expiry, and key ID. The bounded frontier and visited-state live in an injected `TraceContinuationStore`, keyed by tenant, principal subject, exact Scope, Baseline, projection, and query fingerprint. The first deployment uses PostgreSQL with expiration; a shared cache may replace it later without changing the token contract.

Writing an expiring traversal continuation is an operational cache write, not an authored design-fact mutation. It cannot update Baselines, assertions, relationships, Evidence, manifests, or design assets, and it is deleted by retention policy.

Continuation verification rejects signature failure, expiry, principal mismatch, Scope mismatch, Baseline or projection mismatch, stale sequence, state-digest mismatch, and query changes. A partial response returns explicit truncation reasons: `MAX_DEPTH`, `MAX_NODES`, `MAX_EDGES`, `MAX_PATHS`, `TIMEOUT`, or `MAX_PAYLOAD`.

### 12. Published Baseline Drift

The current `deriveKnowledgeProjection` drift output compares Baseline assertions with a supplied current accepted set. The browser requires a separate pure operation:

`comparePublishedBaselines(baseBaseline, targetBaseline, baseManifest, targetManifest, baseNodes, baseEdges, targetNodes, targetEdges)`

The result records both Baseline IDs, both Manifest IDs, exact Scope, `entityKind = NODE | EDGE`, a stable semantic key, before/after references and digests, layer or layer pair, and `ADDED`, `REMOVED`, `CHANGED`, or `UNCHANGED`. A node key is its semantic identity. An edge key is derived from source semantic identity, relation code, target semantic identity, and explicit relationship identity. Thus a relationship-only change is visible even when both endpoint assertions are unchanged. Both Baselines must be `PUBLISHED`, belong to the same stream and exact Scope, and their `READY` Manifests must use the same Profile ID and compatible Profile/projection-schema versions. Working-stream and candidate facts are excluded.

### 13. Authentication And Authorization

Introduce `WebPrincipalResolver` as a request-scoped interface returning the normalized `ScopedPrincipal` already used by MCP policy. It carries stable subject, tenant, auth source, permissions, and exact application-service grants.

- `SPECFORGE_AUTH_MODE=seed` may use the existing development actor adapter.
- Non-seed deployments without a configured resolver fail closed during startup or request handling.
- The UI never trusts `scope`, `baseline`, `projection`, `focus`, or cursor claims from the browser.
- Authorization occurs before counts, existence checks, cursor loads, or error details.
- Raw tokens are never persisted in browse sessions, logs, errors, or DTOs.

Production OAuth/OIDC and tenant administration remain a separate backlog item. This increment delivers the provider boundary and verifies denial behavior; it does not claim enterprise IdP deployment.

### 14. Alignment, Detail, And Localization

Alignment uses only explicit relationship snapshots as of the Baseline relationship version. It groups by source layer, target layer, domain, and relationship code. It reports aligned pairs, unaligned assertion IDs, confidence, Evidence coverage, and missing accepted asset mappings. It never authors an alignment score.

The detail drawer shows canonical English content, complete Chinese overlay when required, layer, aspect, fact type, domain, confidence, status, incoming/outgoing relationships, Evidence, source observations, revision, Baseline, Profile, unresolved questions, counter-evidence, and accepted design-asset mappings.

English is canonical. Chinese is a complete human-facing overlay. Technical IDs, relationship codes, digests, versions, and Scope fields are not translated. Missing required localization produces `LOCALIZATION_INCOMPLETE`; the page may show the canonical text with a warning but cannot fabricate Chinese text.

### 15. Failure And Empty States

| Code | Meaning | UI behavior |
| --- | --- | --- |
| `SCOPE_REQUIRED` | no exact application-service Scope | show scope selection without data counts |
| `SCOPE_ACCESS_DENIED` | principal lacks exact read grant | fail closed with sanitized message |
| `PUBLISHED_BASELINE_NOT_FOUND` | no published Baseline | show official-view unavailable state |
| `PROJECTION_MANIFEST_REQUIRED` | no compatible v2 manifest | show derive/publish operational reference |
| `PROJECTION_BUILD_IN_PROGRESS` | compatible generation exists but is not published | show retryable build status without partial data |
| `PROJECTION_BUILD_FAILED` | latest compatible generation failed | show sanitized retry reference without partial data |
| `FOCUS_NOT_IN_BASELINE` | focus does not belong to selected Baseline | return to searchable catalog |
| `CURSOR_INVALID` | cursor signature, state, identity, or query mismatch | discard continuation and preserve focus |
| `RESULT_PARTIAL` | a query budget was reached | show reasons, counts, and continuation action |
| `LOCALIZATION_INCOMPLETE` | required Chinese overlay missing | show canonical content and warning |
| `EVIDENCE_INCOMPLETE` | Evidence reference is absent or unavailable | show warning without synthesized evidence |
| `QUERY_SERVICE_UNAVAILABLE` | repository or service unavailable | show sanitized retryable reference |

Unauthorized responses never vary based on whether a requested Baseline, projection, focus, or cursor exists.

### 16. Verification And Acceptance

#### Domain and query tests

- v2 Projection Manifests require explicit Profile identity and stable digest fields;
- v2 derive uses bounded batches, resumable build identity, and an atomic `READY` publication transition;
- readers cannot observe `BUILDING`, `FAILED`, or partially materialized generations;
- duplicate build requests are idempotent and published generations are immutable;
- unresolved or ambiguous relationship endpoints block materialization;
- legacy unpinned manifests fail closed;
- latest published Baseline selection is deterministic;
- historical relationships are reconstructed at the Baseline relationship version;
- unpublished, cross-stream, or cross-Scope Baselines are rejected;
- Baseline-to-Baseline drift records both IDs, detects node and relationship changes, and excludes candidates;
- search ordering and continuation are stable;
- traversal continuation has no duplicates and rejects identity, Scope, version, sequence, and digest mismatch;
- every budget produces explicit partial metadata;
- Evidence and accepted identity mappings remain exact-Scope and read-only.

#### Authorization tests

- seed mode uses only the explicit development adapter;
- non-seed mode without a resolver fails closed;
- sibling-Scope and cross-tenant access reveal no counts or existence;
- Web and MCP principals produce the same allow/deny result;
- cursor replay by a different subject is rejected.

#### Web tests

- navigation preserves Scope and opens `/architecture/3a`;
- URL refresh restores Baseline, projection, focus, tab, mode, and direction;
- BIZ default catalog, any-layer search, and bidirectional tracing work;
- lane and list modes render the same returned nodes and edges;
- detail, Alignment, Drift, empty, partial, localization, authorization, and availability states render;
- no mutation handler or edit control exists;
- desktop, narrow desktop, and mobile render without overlap or blank canvas;
- keyboard navigation, focus treatment, and reduced-motion behavior pass focused checks.

#### Operational and governance checks

- exact-Scope Web smoke uses `com.huawei.celon.desiner`;
- MCP and Web read adapters pass the same contract fixtures;
- production build and focused tests pass;
- matching ADR, Proposal, Context Pack, Evidence, backlog facts, and typed links are written through MCP and read back;
- design-fact reconciliation has no missing, mismatched, out-of-scope, or blocked facts;
- exact-Scope federation reconciliation returns `blocking:false`;
- the design and implementation sessions close with exact command evidence.

## 中文完整覆盖

### 1. 状态与追溯

本修订解决架构审查发现的问题。产品方向已经确认，但书面 Spec 仍需批准后才能进入实施计划。

- 所属应用服务：`com.huawei.celon.desiner`
- 所属 Scope：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 设计变更会话：`design-change-session:882fb4fb-cd55-4bba-a75c-d05c1d01b7bc`
- 拟新增 ADR ID：`adr-3a-architecture-navigation-workspace`
- 拟新增 Proposal ID：`proposal-3a-architecture-navigation-workspace`
- 拟新增 Context Pack ID：`ctx-3a-architecture-navigation-workspace`
- 关联决策：`adr-deterministic-3a-knowledge-projections`、`adr-application-service-scope-isolation`、`adr-mcp-first-architecture`、`adr-postgresql-authoritative-design-store`

书面设计批准后，必须通过 MCP 在精确 Scope 中持久化对应 ADR、Proposal、Context Pack、Evidence、待办事实和有方向的类型关系。仓库记录与 MCP 记录对账通过后才能关闭当前设计会话；实施阶段必须创建新的精确 Scope 会话。

### 2. 问题与产品决策

SpecForge 已能确定性派生 BIZ、SYS、TECH、跨层对齐、漂移和固定 Context Pack，但 Web 控制台没有产品化的 3A 浏览器。通用设计资产图不能替代绑定 Baseline 的架构视图。

产品决策是在 `/architecture/3a` 提供只读、业务优先的架构导航工作台。页面只展示一个已授权应用服务 Scope 和一个已发布 Baseline，从焦点路径开始而不是加载完整图，支持任意层搜索和双向追溯。

第一增量只使用 PostgreSQL。现有 NebulaGraph 投影保存的是设计资产身份，不是绑定 Baseline 的 Knowledge Assertion，因此不能提供语义等价的 3A 遍历。专用 3A 图投影和 Nebula Reader 必须作为独立治理增量交付。

### 3. 目标

- 从业务意图追踪到系统实现和技术实现，并支持反向追溯。
- 只读取明确选择的 `PUBLISHED` Baseline 中的事实。
- 对每个节点、关系、数量和继续查询执行精确租户与应用服务授权。
- 使用确定性、有界、可恢复的查询，不渲染完整关系图。
- 展示显式类型对齐、两个 Baseline 的漂移、Evidence 和已接受身份映射。
- Web 与 MCP 读取客户端复用同一查询契约。
- 所有正式修改继续通过 MCP。

### 4. 非目标

- 在 Web 中编辑、评审、提升、批准事实或发布 Baseline。
- 跨应用服务比较或聚合。
- 根据名称、布局或模型相似度推断关系。
- 第一增量使用 NebulaGraph 执行 3A 遍历。
- 在浏览器中渲染整个 Scope 或十亿条关系。
- 本增量交付生产 IdP、外部连接器、自动提升、出站 Proposal、外部 `APPLY` 或新的 AI 生成。
- 在没有容量证据时声称已经完成十亿级认证。本设计只保证有界和可横向扩展的结构，规模认证仍需独立证据。

### 5. 交付拆分

#### 增量 A：PostgreSQL 3A 浏览器

本 Spec 及后续实施计划包含：

- 在 v2 Projection Manifest 中显式固定 Profile；
- 在 PostgreSQL 中可恢复地物化并原子发布绑定 Baseline 的投影节点和关系；
- 共享且精确 Scope 的 3A 查询包；
- PostgreSQL Baseline 快照读取；
- 签名搜索游标和服务端保存的遍历继续状态；
- 请求 Principal 解析及仅限 seed 模式的开发适配器；
- Web 导航、泳道、列表降级、对齐、漂移、详情和错误状态；
- 等价 MCP 读取工具；
- 聚焦验证和 MCP 设计事实同步。

#### 增量 B：3A 图投影

该能力作为 SpecForge Runtime 所有的独立待办。启动条件是增量 A 验收通过并获得真实查询遥测。它需要独立 ADR，并定义 Knowledge Assertion 顶点、版本化关系边、Baseline 成员或 as-of 语义、Outbox 事件、检查点命名空间、重建行为，以及 PostgreSQL/Nebula 一致性证据。它不进入第一阶段实施计划。

### 6. 路由与用户体验

在工作台之后、设计资产之前增加“3A 架构”一级菜单，路由为 `/architecture/3a`。

URL 保存可分享的架构状态：

- `scope`：必填的应用服务 ID；
- `baseline`：已发布 Baseline ID，默认按 `publishedAt DESC, id ASC` 确定性选择；
- `projection`：固定 Profile 和投影 Schema 的 v2 Projection Manifest ID；
- `focus`：Knowledge Assertion ID；
- `tab`：`architecture`、`alignment` 或 `drift`；
- `mode`：`lanes` 或 `list`；
- `direction`：`upstream`、`downstream` 或 `both`。

语言继续使用现有 Cookie 和 localStorage 机制。API 读取可以使用已有可选 `locale` 参数，但分享 URL 不要求包含语言，语言也不能修改规范内容。

#### 默认流程

1. 在任何依赖数据的查询前解析请求 Principal 和精确 Scope。
2. 解析 URL 指定的已发布 Baseline，或确定性选择最新已发布 Baseline。
3. 解析配置的默认 Profile 对应的 v2 Projection Manifest，或使用 URL 指定的 `projection`。
4. 打开分页 BIZ 目录，不加载关系。
5. 从任意层搜索或选择事实。
6. 在 BIZ、SYS、TECH 泳道中渲染选中事实和第一段有界跨层路径。
7. 使用继续令牌展开单个分支，或选择其他节点作为焦点。
8. 在右侧抽屉中查看事实、Evidence、类型关系、已接受身份映射和投影元数据。

页面只读，只提供导航链接，不提供修改控件。

### 7. 页面组件

- `ThreeAWorkspace`：管理 URL、Baseline、Projection、页签、模式、焦点和历史。
- `BaselineToolbar`：显示 Scope、Baseline、Profile/version、搜索、页签和模式。
- `ArchitectureLanes`：渲染稳定的 BIZ、SYS、TECH 泳道。
- `ArchitectureNode`：渲染规范名称、本地化名称、事实类型、置信度和完整性标记。
- `ArchitectureEdge`：渲染方向、关系代码、置信度和截断前沿。
- `ArchitectureDetailDrawer`：只读展示事实、Evidence、关系、修订、问题和资产链接。
- `AlignmentView`：展示显式跨层对齐和未对齐事实。
- `PublishedBaselineDriftView`：比较两个已发布 Baseline。
- `ArchitecturePathList`：键盘友好且适用于移动端的同结果列表模式。
- `ProjectionStateBanner`：展示空状态、截断、授权和可用性错误。

泳道使用稳定节点尺寸和固定焦点位置；移动端默认列表模式。大结果可以建议切换列表，但不能静默省略查询已经返回的节点。

### 8. 共享模块边界

任何应用都不得导入另一个应用的内部持久化代码。

#### `@specforge/core`

负责纯领域契约：

- 显式包含 `profileId`、`profileVersion` 和 `projectionSchemaVersion` 的 `ProjectionManifestV2`；
- 绑定 Baseline 的 `KnowledgeProjectionNode` 和 `KnowledgeProjectionEdge` 契约；
- 投影生成生命周期、规范构建键和发布不变量；
- 同时包含 `baseBaselineId` 和 `targetBaselineId` 的 `PublishedBaselineDrift`；
- 校验、稳定排序、摘要规则和 DTO 值对象。

#### `@specforge/knowledge-query`

新增包，负责：

- `ThreeAProjectionQueryService`；
- Repository 和 Principal Policy 接口；
- 查询 DTO 和类型化错误；
- 搜索游标签名与验证；
- 遍历继续策略；
- 使用注入 Prisma 兼容客户端的 PostgreSQL Repository 适配器。

该包不创建全局数据库客户端，也不执行任何正式写入。

#### Web 适配器

`apps/web` 解析请求 Principal、实例化共享服务、映射 URL 并渲染 DTO。页面组件不得直接调用 Prisma。

#### MCP 适配器

`apps/mcp-server` 基于同一服务提供等价读取工具，并传入已经规范化的 `ScopedPrincipal`。MCP 继续是唯一正式写入边界。

### 9. Manifest 与 Baseline 语义

Baseline 保持 Profile 无关，Profile 身份属于派生投影。

`ProjectionManifestV2` 必须包含：

- 精确 `architectureScope`；
- `baselineId`；
- `profileId` 和 `profileVersion`；
- `projectionSchemaVersion = 3a.v2`；
- 已排序的 `sourceRevisionIds`；
- `relationshipVersion`；
- 规范查询定义；
- 规范输入摘要、生成 ID、生命周期状态、完成计数、内容摘要和时间戳。

生命周期为 `BUILDING -> READY` 或 `BUILDING -> FAILED`。规范构建键由精确 Scope、Baseline、Profile ID/版本、投影 Schema 版本、排序后的来源修订、关系版本和规范化查询定义计算。运行状态、时间戳和数据库生成 ID 不进入该摘要。

Schema 迁移新增可空 Profile 列以保留历史记录。禁止猜测或静默回填旧 Manifest。3A 浏览器只接受显式固定 Profile 的 v2 Manifest。已有 Baseline 没有兼容 v2 Manifest 时返回 `PROJECTION_MANIFEST_REQUIRED`，必须通过具有独立证据的 MCP 派生操作创建新 Manifest。

v2 MCP 派生操作使用现有确定性规则选择 Baseline 断言：Baseline 明确列出的已接受断言，或绑定 Baseline ChangeSet 的已接受断言。类型关系必须根据追加式 `RelationshipEvent` 快照重建到 `BaselineManifest.relationshipVersion`，不能把更新的可变 `AssetLink` 当前状态当作历史 Baseline。

派生操作根据类型关系断言、提升资产中的 `knowledgeRevision.sourceAssertionId` 和已接受身份决策，把每个显式关系端点解析到同一 Baseline 的断言。端点缺失或歧义时分别返回 `PROJECTION_ENDPOINT_UNRESOLVED` 或 `PROJECTION_ENDPOINT_AMBIGUOUS`，禁止通过猜测形成扇出关系。

派生操作先按规范构建键获得构建租约，创建 `BUILDING` 代次，然后使用有限批次写入以下派生读取模型：

- `KnowledgeProjectionNode`：精确 Scope、Manifest、Baseline、断言 ID、语义身份、层级、稳定排序键、可选已接受资产引用和内容摘要；
- `KnowledgeProjectionEdge`：精确 Scope、Manifest、Baseline、关系事件/断言引用、来源断言 ID、目标断言 ID、关系代码、置信度、关系版本和内容摘要。

全部批次写入后，由一个短 PostgreSQL 事务校验端点闭合、行数和规范内容摘要，再把代次标记为 `READY`。Reader 永远不能看到 `BUILDING` 或 `FAILED` 代次。失败构建标记为 `FAILED`，只保存脱敏原因和重试引用；过期构建由保留策略清理。相同构建键的重复派生请求只能返回已有 `READY` 代次、恢复属于自身且有效的 `BUILDING` 代次，或在摘要冲突时失败；不能删除或修改 `READY` 代次。

这些记录发布后不可变，并且可以从权威事实重建。浏览 Reader 只查询固定的 `READY` 物化结果，并按精确 Scope 关联权威断言、Evidence 和本地化详情。Web 交互不需要每次重建历史关系状态。分阶段发布避免事务时长随 Baseline 增长，同时保持对 Reader 的原子可见性。

### 10. 查询契约

| 操作 | 结果 | 授权条件 |
| --- | --- | --- |
| `listPublishedBaselines` | 确定性 Baseline 摘要 | 租户与精确 Scope 读取授权 |
| `listProjectionManifests` | Baseline 对应的兼容 `READY` v2 Manifest | 租户、精确 Scope、Baseline |
| `searchArchitectureFacts` | 排序后的 BIZ/SYS/TECH 事实和搜索游标 | 租户、Scope、Baseline、Projection |
| `traceArchitecturePath` | 有界节点、边、前沿和继续令牌 | 租户、Scope、Baseline、Projection |
| `getArchitectureFactDetail` | 事实、本地化、Evidence、关系和已接受资产映射 | 租户、Scope、Baseline、Projection |
| `getArchitectureAlignment` | 显式对齐和未对齐事实 | 租户、Scope、Baseline、Projection |
| `comparePublishedBaselines` | `ADDED`、`REMOVED`、`CHANGED`、`UNCHANGED` | 租户、精确 Scope、两个已发布 Baseline 和两个兼容 Projection |

每个 DTO 都返回 `applicationServiceId`、`scopePath`、`baselineId`、`projectionManifestId`、`profileId`、`profileVersion`、`relationshipVersion` 和确定性结果摘要。服务端在返回任何关系前校验两个端点。

Evidence 引用只能解析同 Scope 的 Evidence。设计资产链接只能通过断言来源 Observation 对应的 `ACCEPTED` 身份决策解析。缺失或拒绝的身份映射只形成完整性告警，不能创建链接。

### 11. 游标与查询预算

产品没有总跳数上限，但每次请求必须有限。

默认请求预算：

- `maxDepth = 2`；
- `maxNodes = 200`；
- `maxEdges = 400`；
- `maxPaths = 100`；
- `timeoutMs = 2000`；
- `maxPayloadBytes = 524288`。

服务端策略可以调低预算。第一增量的单请求硬上限为深度 5、1,000 个节点、2,000 条边、1,000 条路径、5 秒和 2 MiB。这些是安全边界，不是容量认证。

搜索使用签名、不透明、无状态游标，包含版本、租户、Scope 摘要、Baseline、Projection、规范过滤条件摘要、最后排序键、过期时间和密钥 ID。

遍历使用只包含 `browseSessionId`、序号、状态摘要、过期时间和密钥 ID 的签名令牌。有界 frontier 和 visited 状态保存在注入的 `TraceContinuationStore` 中，并绑定租户、Principal subject、精确 Scope、Baseline、Projection 和查询指纹。第一部署使用带过期时间的 PostgreSQL，后续可以替换为共享缓存而不改变令牌契约。

写入带过期时间的遍历继续状态属于运维缓存写入，不是正式设计事实修改。它不能更新 Baseline、断言、关系、Evidence、Manifest 或设计资产，并由保留策略自动删除。

继续校验必须拒绝签名失败、过期、Principal 不匹配、Scope 不匹配、Baseline 或 Projection 不匹配、陈旧序号、状态摘要不匹配和查询变化。部分结果明确返回 `MAX_DEPTH`、`MAX_NODES`、`MAX_EDGES`、`MAX_PATHS`、`TIMEOUT` 或 `MAX_PAYLOAD`。

### 12. 已发布 Baseline 漂移

现有 `deriveKnowledgeProjection` 漂移比较 Baseline 断言和调用方传入的当前已接受集合。浏览器需要独立纯函数：

`comparePublishedBaselines(baseBaseline, targetBaseline, baseManifest, targetManifest, baseNodes, baseEdges, targetNodes, targetEdges)`

结果记录两个 Baseline ID、两个 Manifest ID、精确 Scope、`entityKind = NODE | EDGE`、稳定语义键、前后引用和摘要、层级或层级对，以及 `ADDED`、`REMOVED`、`CHANGED` 或 `UNCHANGED`。节点键是语义身份；关系键由来源语义身份、关系代码、目标语义身份和显式关系身份共同形成。因此，即使两个端点断言都未变化，关系自身变化仍然可见。两个 Baseline 都必须为 `PUBLISHED`，属于同一个 Stream 和精确 Scope；两个 `READY` Manifest 必须使用相同 Profile ID 以及兼容的 Profile 与投影 Schema 版本。工作流和候选事实不得进入正式漂移结果。

### 13. 身份认证与授权

新增请求级 `WebPrincipalResolver`，返回 MCP 策略已经使用的规范化 `ScopedPrincipal`，包含稳定 subject、tenant、auth source、permissions 和精确应用服务授权。

- `SPECFORGE_AUTH_MODE=seed` 可以使用现有开发 Actor 适配器；
- 非 seed 部署未配置 Resolver 时必须在启动或请求阶段失败关闭；
- UI 不能信任浏览器提交的 `scope`、`baseline`、`projection`、`focus` 或游标声明；
- 授权必须发生在数量、存在性、游标状态或错误详情查询之前；
- 原始 Token 不能写入浏览会话、日志、错误或 DTO。

生产 OAuth/OIDC 和租户管理继续作为独立待办。本增量只交付 Provider 边界并验证拒绝行为，不宣称已交付企业 IdP。

### 14. 对齐、详情与本地化

对齐只使用 Baseline 关系版本对应的显式关系快照，并按来源层、目标层、领域和关系代码分组。它展示已对齐对、未对齐断言、置信度、Evidence 覆盖和缺少的已接受资产映射，不生成新的对齐分数事实。

详情抽屉展示英文规范内容、必需的完整中文覆盖、层级、Aspect、事实类型、领域、置信度、状态、出入关系、Evidence、来源 Observation、修订、Baseline、Profile、未决问题、反证和已接受设计资产映射。

英文是规范内容，中文是完整的人类可读覆盖。技术 ID、关系代码、摘要、版本和 Scope 字段不翻译。缺失中文时返回 `LOCALIZATION_INCOMPLETE`；页面可以带告警展示英文规范内容，但不能生成中文文本。

### 15. 失败与空状态

| 代码 | 含义 | 页面行为 |
| --- | --- | --- |
| `SCOPE_REQUIRED` | 缺少精确应用服务 Scope | 显示 Scope 选择，不显示数据数量 |
| `SCOPE_ACCESS_DENIED` | Principal 没有精确读取授权 | 失败关闭并显示脱敏消息 |
| `PUBLISHED_BASELINE_NOT_FOUND` | 没有已发布 Baseline | 显示正式架构视图不可用 |
| `PROJECTION_MANIFEST_REQUIRED` | 没有兼容 v2 Manifest | 显示派生/发布运维引用 |
| `PROJECTION_BUILD_IN_PROGRESS` | 存在兼容代次但尚未发布 | 显示可重试构建状态且不返回部分数据 |
| `PROJECTION_BUILD_FAILED` | 最新兼容代次构建失败 | 显示脱敏重试引用且不返回部分数据 |
| `FOCUS_NOT_IN_BASELINE` | 焦点不属于 Baseline | 返回可搜索目录 |
| `CURSOR_INVALID` | 游标签名、状态、身份或查询不匹配 | 丢弃继续状态并保留焦点 |
| `RESULT_PARTIAL` | 查询达到预算 | 显示原因、数量和继续操作 |
| `LOCALIZATION_INCOMPLETE` | 缺少必需中文覆盖 | 显示英文规范内容和告警 |
| `EVIDENCE_INCOMPLETE` | Evidence 引用缺失或不可用 | 显示告警且不生成 Evidence |
| `QUERY_SERVICE_UNAVAILABLE` | Repository 或服务不可用 | 显示可重试的脱敏引用 |

未授权响应不能因为 Baseline、Projection、焦点或游标是否真实存在而产生可观察差异。

### 16. 验证与验收

#### 领域与查询测试

- v2 Projection Manifest 必须包含显式 Profile 和稳定摘要字段；
- v2 派生必须使用有限批次、可恢复构建身份和原子 `READY` 发布转换；
- Reader 不能看到 `BUILDING`、`FAILED` 或部分物化的代次；
- 重复构建请求必须幂等，已发布代次不可变；
- 未解析或歧义关系端点必须阻止物化；
- 旧的未固定 Manifest 必须失败关闭；
- 最新已发布 Baseline 的选择必须确定；
- 历史关系必须按 Baseline 关系版本重建；
- 未发布、跨 Stream 或跨 Scope Baseline 必须拒绝；
- Baseline 漂移必须记录两个 ID、发现节点和关系变化，并排除候选；
- 搜索排序和继续必须稳定；
- 遍历继续不能产生重复，并拒绝身份、Scope、版本、序号和摘要不匹配；
- 每种预算都必须产生明确的部分结果元数据；
- Evidence 和已接受身份映射必须精确 Scope 且只读。

#### 授权测试

- seed 模式只能使用显式开发适配器；
- 非 seed 模式缺少 Resolver 时失败关闭；
- 同级 Scope 和跨租户访问不能泄露数量或存在性；
- Web 与 MCP Principal 必须产生相同授权结果；
- 其他 subject 重放游标必须拒绝。

#### Web 测试

- 导航保留 Scope 并进入 `/architecture/3a`；
- 刷新恢复 Baseline、Projection、焦点、页签、模式和方向；
- BIZ 默认目录、任意层搜索和双向追溯可用；
- 泳道和列表展示相同返回节点与关系；
- 详情、对齐、漂移、空状态、部分结果、本地化、授权和不可用状态可见；
- 不存在修改处理器或编辑控件；
- 桌面、窄屏和移动端没有重叠或空白画布；
- 键盘导航、焦点样式和减少动效行为通过验证。

#### 运维与治理检查

- 精确 Scope Web 冒烟使用 `com.huawei.celon.desiner`；
- MCP 与 Web 读取适配器通过同一组契约夹具；
- 生产构建和聚焦测试通过；
- 通过 MCP 写入并回读匹配的 ADR、Proposal、Context Pack、Evidence、待办事实和类型关系；
- 设计事实对账不存在缺失、不匹配、越界或阻塞项；
- 精确 Scope 联邦对账返回 `blocking:false`；
- 设计会话和实施会话都以精确命令证据关闭。
