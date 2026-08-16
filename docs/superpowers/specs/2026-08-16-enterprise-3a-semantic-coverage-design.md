# Enterprise-Wide 3A Semantic Coverage Design

## Status

- Design approved for specification; implementation has not started.
- Owning application service: `com.huawei.celon.desiner`.
- Owning Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- Design Change Session: `design-change-session:3f60911b-4a6e-49d8-977d-0391dcea39f3`.
- Preflight design-context digest: `b4a95d9ea366bd41b2a639e18c0726a040df74227c95b144cac42856320a2c9c`.
- Preflight relationship digest: `b37be4a2d0a982c684493620440873e92e5e2033c337ffe7131ff14a2d61fe81`.
- English is canonical. Chinese is the complete human-facing localization.

## Context

The published Designer v6 architecture Baseline contains 8 architecture units, 42 direct memberships, and 6 cross-layer mappings. It is a reviewed architecture snapshot, not a claim that every authored asset is itself an architecture component.

The exact Designer Scope currently contains 293 authored records: 249 design assets, 23 Proposals, and 21 Context Packs. The design assets include architecture-bearing contracts and models as well as Quality requirements, ADRs, and Evidence. Treating every record as a direct 3A member would collapse architecture structure, governance, and verification into one unreadable hierarchy.

Enterprise use nevertheless requires a deterministic answer for every in-scope record:

- which architecture unit directly owns or realizes it;
- which classified decision or asset it traces to;
- why it is blocked from classification; or
- why an explicit governed exemption applies.

The system therefore needs a complete semantic coverage projection over the authored catalog while preserving the accepted v6 architecture meaning.

## Industry Alignment

This design follows three general architecture principles rather than enterprise-specific terminology:

- ISO/IEC/IEEE 42010 separates stakeholder concerns, viewpoints, model kinds, and architecture descriptions. One structural view is not expected to contain every governance concern.
- ArchiMate separates structural and behavioral elements from Motivation elements such as Requirements and Constraints. Quality and decision records should trace to architecture rather than be promoted automatically into structural components.
- Backstage separates Components, APIs, and Resources from higher-level Systems and Domains, and describes its catalog graph as a model of human understanding rather than an exhaustive inventory visualization.

References:

- <https://www.iso.org/standard/74393.html>
- <https://www.opengroup.org.cn/sites/default/files/N221C_%E6%97%A0%E6%B0%B0%E5%8D%B0%E7%89%88.pdf>
- <https://backstage.io/docs/next/features/software-catalog/system-model/>
- <https://backstage.io/docs/features/software-catalog/creating-the-catalog-graph/>

## Goals

- Preserve the published v6 Baseline as `8/42/6`; do not create an artificial v7 architecture snapshot.
- Define a versioned enterprise coverage profile that classifies every authored record by architecture membership, traceability, governed exemption, or an explicit blocker.
- Materialize immutable, exact-Scope coverage results that remain queryable after the catalog changes.
- Make current-catalog drift visible without mutating historical projection generations.
- Repair the six verified traceability gaps through MCP-only typed relationship writes.
- Expose bounded, paginated coverage reads through MCP and the existing 3A workspace.
- Keep PostgreSQL authoritative and any graph database a derived projection only.

## Non-Goals

- Replacing v6 architecture-unit semantics or reassigning its accepted memberships.
- Promoting Quality, ADR, Evidence, Proposal, or Context Pack records into architecture units merely to increase a coverage percentage.
- Performing arbitrary graph traversal at request time.
- Introducing a graph database dependency for coverage correctness.
- Providing cross-application-service comparison or cross-Scope writes.
- Automatically inventing missing business meaning from names, file paths, embeddings, or graph proximity.
- Claiming that source-owner confirmation, legacy scanning, or continuous external synchronization is delivered by this increment.

## Considered Approaches

### 1. Add all records as v7 direct members

Rejected. It would change an accepted architecture Baseline without a new architecture decision, put governance records into structural units, and make architecture navigation less meaningful.

### 2. Compute coverage through live graph traversal

Rejected. Query-time traversal over a large relationship graph produces unstable answers, creates latency and token-budget risk, and cannot preserve a historical result after relationships change.

### 3. Keep v6 and publish an immutable coverage projection

Selected. The architecture Baseline remains the reviewed structural truth. A separately versioned profile and projection explain how every authored record relates to that truth. The projection stores the resolved path evidence so reads never need to rediscover it.

## Coverage Profile

The first profile is `generic-system@2`. The profile is immutable once used by a published manifest. A policy change requires a new profile version and a new projection generation.

Each authored record receives one primary coverage role:

| Role | Meaning | Typical asset types |
| --- | --- | --- |
| `MEMBERSHIP` | The record is an accepted direct member of an architecture unit. | domain, API, event, business rule, state machine, integration, data model/entity/field, observability, application service |
| `TRACEABILITY` | The record is a governance or verification concern connected to a classified member through an allowed typed path. | quality, ADR, evidence, proposal, context pack |
| `EXEMPTION` | The record is intentionally outside the profile and has an approved reason, owner, evidence, and profile version. | controlled exceptional cases only |

The accepted v6 ADR membership is retained as a historical Baseline fact. It does not establish a general policy that ADRs are membership-eligible.

Each row also has one status:

- `COVERED`: the membership or role-specific traceability path is valid, or the governed exemption is valid;
- `BLOCKED`: the record should be covered but a required membership, endpoint, relation, localization, or Scope condition is missing or invalid;
- `NOT_EVALUATED`: the pinned projection did not evaluate the record because its input was unavailable or the job stopped before a deterministic result.

An exemption is counted separately even though its row status is `COVERED`. An exemption cannot conceal a dangling, wrong-direction, cross-Scope, or unsupported relationship.

## Role-Specific Path Grammar

Coverage uses directed, type-constrained path grammar, not a generic breadth-first search. The maximum accepted path length is three relationships.

| Source role | Allowed path to a v6 direct member |
| --- | --- |
| Quality | `quality -VERIFIES-> member` |
| ADR | `adr -DECIDES-> member` |
| Evidence | `evidence -VALIDATES-> adr -DECIDES-> member` |
| Proposal | `proposal -IMPACTS-> member` |
| Proposal | `proposal -IMPLEMENTS_DECISION-> adr -DECIDES-> member` |
| Context Pack | `contextPack -IMPLEMENTS_CONTEXT_FOR-> proposal -IMPACTS-> member` |
| Context Pack | `contextPack -IMPLEMENTS_CONTEXT_FOR-> proposal -IMPLEMENTS_DECISION-> adr -DECIDES-> member` |

Every edge must:

- exist in the canonical typed relationship store;
- match the relationship ontology source and target types;
- use the declared direction;
- remain inside the exact application-service Scope;
- resolve to an existing endpoint revision; and
- terminate at a direct member of the pinned Baseline generation.

Direct membership is evaluated before traceability. A record with no direct membership continues to its role-specific traceability rule; a record with more than one direct membership is `BLOCKED` as `AMBIGUOUS_MEMBERSHIP` unless the pinned profile explicitly permits that asset type to be shared. When more than one valid traceability path exists, the projector selects one deterministically by shortest path, profile-declared path precedence, terminal member identity, and then relationship identity. All other valid paths may be counted for diagnostics but cannot change the selected row digest.

Three hops are sufficient for all supported governance roles. Increasing the traversal depth would not repair missing design facts and would increase accidental path matches.

## Verified Current Coverage

A read-only audit of the exact Designer Scope produced the following traceability result against v6:

| Type | Total | Covered within three hops | Blocked |
| --- | ---: | ---: | ---: |
| Quality | 2 | 2 | 0 |
| Non-member ADR | 23 | 22 | 1 |
| Evidence | 182 | 181 | 1 |
| Proposal | 23 | 20 | 3 |
| Context Pack | 21 | 20 | 1 |

Together with the 42 direct v6 members, the current pinned catalog closes as 287 covered records and 6 blocked records, totaling all 293 authored records.

The six blocked records are:

- `adr-readable-3a-architecture-mapping-v6`;
- `evidence-designer-3a-v6-semantic-unit-expansion`;
- `proposal-readable-3a-architecture-mapping-v6`;
- `ctx-readable-3a-architecture-mapping-v6`;
- `proposal-agent-service-workspace`;
- `proposal-mcp-native-scoped-seeding`.

The first four already form a valid governance chain, but the v6 ADR has no `DECIDES` relationship to the four assets that became direct v6 members. The final two Proposals contain valid `impactedAssets` payloads but lack canonical `IMPACTS` relationship facts. Payload references are descriptive input; they are not substitutes for typed graph facts.

## Relationship Repair

The implementation must repair the six blockers through exact-Scope MCP writes before publishing a zero-blocker coverage manifest:

- add `DECIDES` relationships from `adr-readable-3a-architecture-mapping-v6` to `api-specforge-web-console`, `api-specforge-ai-generation`, `api-specforge-graph-query`, and `obs-specforge-mcp-audit`;
- add `IMPACTS` relationships from `proposal-agent-service-workspace` to its three declared impacted assets;
- add `IMPACTS` relationships from `proposal-mcp-native-scoped-seeding` to its four declared impacted assets.

The existing Evidence, Proposal, and Context Pack links then become covered through the approved grammar. The implementation must validate every endpoint through the relationship ontology and must not add a synthetic shortcut merely to satisfy a metric.

## Immutable Catalog Snapshot

The current authored tables are mutable current-state records. `DesignAsset` and `Proposal` expose timestamps, while `ContextPack` has no update timestamp, so timestamps alone cannot guarantee a reproducible enterprise projection.

Coverage therefore introduces an append-only authored catalog revision stream:

### `AuthoredCatalogCursor`

- exact `applicationServiceId` and `scopePath`;
- monotonically increasing `catalogVersion`;
- latest committed mutation timestamp;
- unique identity per exact Scope.

### `AuthoredAssetRevision`

- exact Scope;
- `catalogVersion`;
- `assetType` and `assetId`;
- operation `UPSERT` or `DELETE`;
- canonical payload snapshot;
- canonical `contentDigest`;
- actor, channel, correlation ID, and idempotency key;
- committed timestamp.

Every MCP write to DesignAsset, Proposal, Context Pack, and every supported deletion increments the Scope cursor, appends one immutable revision, and updates the current-state table in the same PostgreSQL transaction. Existing current rows receive a one-time bootstrap revision whose digest is verified against the canonical row; this migration creates revision metadata and does not create or alter authored design meaning.

Typed relationships continue to use the existing append-only `RelationshipEvent.graphVersion` waterline. Coverage input is therefore pinned by both catalog and relationship versions.

## Coverage Projection Model

### `ArchitectureCoverageManifest`

An immutable manifest contains:

- exact Scope;
- manifest ID and generation ID;
- pinned v6 Baseline ID and projection generation ID;
- `profileId=generic-system` and `profileVersion=2`;
- pinned `catalogVersion` and `catalogDigest`;
- pinned `relationshipVersion` and `relationshipDigest`;
- membership digest;
- canonical `inputDigest` and projection `contentDigest`;
- counts by role, status, type, and layer;
- publication status and timestamps.

The build key is the digest of exact Scope, Baseline identity, profile identity, projection schema version, catalog version/digest, relationship version/digest, and canonical query inputs. Attempts and timestamps are excluded.

A published manifest may be reused only when its `inputDigest` exactly equals the requested build key. Looking up a published manifest by Baseline, profile, and schema alone is forbidden.

### `ArchitectureAssetCoverageProjection`

One immutable row per authored record contains:

- exact Scope and generation ID;
- `assetType` and `assetId`;
- source catalog version and source content digest;
- coverage role and status;
- architecture unit identity for membership coverage;
- terminal member identity for traceability coverage;
- reason code and human-readable diagnostic reference;
- bounded resolved path evidence containing relationship IDs, codes, directions, and endpoint identities;
- row content digest.

The unique identity is exact Scope plus generation ID, asset type, and asset ID. Indexes support status/role/type filtering and keyset pagination. Path evidence is materialized with the row; public reads do not traverse the live relationship graph.

## Build and Publication Flow

1. Authorize the exact Scope and load the selected official Baseline and immutable profile.
2. In one short PostgreSQL transaction, pin the current catalog version, relationship version, Baseline generation, profile version, and their input digests; create or reuse a job by exact build key.
3. Read immutable authored revisions at or before the pinned catalog version and reconstruct typed relationships at or before the pinned relationship version.
4. Process records in deterministic asset-type and asset-ID order with keyset pagination and bounded batches.
5. Evaluate direct membership first, then role-specific traceability grammar, then controlled exemptions.
6. Persist immutable coverage rows and checkpoints idempotently.
7. Validate row counts, unique identities, endpoint closure, Scope closure, content digests, and all blocker reasons.
8. Publish the manifest atomically only when every expected record has exactly one result row and all digests match.
9. Re-read the public MCP report and the Web summary before closing the Design Change Session.

The worker may run asynchronously. Publication is atomic; partial generations are never exposed as `READY`.

## Current and Stale Semantics

A historical manifest is immutable and always describes its pinned inputs. It is `CURRENT` only when all of the following still match the exact Scope:

- latest authored catalog version and digest;
- latest relationship version and digest;
- selected official Baseline generation;
- selected coverage profile version.

Any mismatch marks the manifest `STALE`. The system never rewrites a historical manifest. A stale result remains queryable with its pinned identities while a new build is queued or processed.

## MCP Contract

Add `get_3a_coverage_report` as an exact-Scope, read-only MCP tool. Required or defaulted inputs are:

- `architectureScope`;
- optional manifest or generation ID, defaulting to the latest published generation;
- optional filters for role, status, asset type, architecture unit, and reason code;
- bounded `limit` and opaque keyset continuation token;
- locale for human-facing labels, with English remaining canonical.

The response contains:

- pinned manifest identity and all source waterlines;
- `CURRENT` or `STALE` state;
- summary counts by role and status;
- paginated coverage rows;
- partial-result and continuation metadata;
- no data, counts, endpoint names, or diagnostics from another Scope.

The tool never triggers arbitrary graph traversal. A build request and build-status contract may be exposed separately, following the existing asynchronous projection pattern.

## Web Experience

The existing 3A architecture workspace gains a compact read-only coverage summary and a filterable detail region. It does not gain a separate top-level page.

The summary shows membership coverage, traceability coverage, blockers, exemptions, not-evaluated records, and current/stale state. The detail region supports the same bounded filters as MCP and explains the resolved relationship path or blocker reason. Existing architecture-unit counts and `unclassifiedCount` keep their current semantics.

## Scale and Storage

- PostgreSQL remains authoritative for authored revisions, relationship events, manifests, and coverage rows.
- Coverage generation uses immutable waterlines, keyset pagination, deterministic batches, and idempotent checkpoints.
- Public reads use indexed materialized rows and do not scan all relationships.
- The maximum relationship path is three and is constrained by source type and relation grammar.
- Graph databases may consume the published manifest as a derived visualization or analysis projection, but graph availability cannot change coverage correctness.
- Retention may archive superseded projection rows only after their manifest, digests, audit references, and reproducibility policy are preserved.

This design is suitable for catalogs and relationship stores that greatly exceed interactive query budgets because expensive resolution happens once per immutable generation rather than once per user request.

## Failure Handling

- Missing or mismatched Scope, Baseline, profile, endpoint, localization, revision, or relationship waterline fails closed.
- A changed catalog or relationship input cannot reuse a previously published manifest.
- Dangling endpoints, wrong relation direction, ontology-invalid types, cross-Scope paths, and unsupported path sequences produce `BLOCKED`, not exemption.
- Worker interruption leaves the generation non-public and resumes from an idempotent checkpoint.
- A digest or row-count mismatch prevents publication.
- Failure to persist the matching ADR, Proposal, Context Pack, Evidence, or typed links through MCP is recorded as `MCP synchronization blocked`; completion cannot be claimed.

## Verification

- Profile tests cover every supported asset role, path grammar, wrong-direction relation, invalid endpoint type, cross-Scope edge, dangling endpoint, and exemption policy.
- Snapshot tests prove writes after the pinned catalog or relationship version do not alter a generation under construction.
- Build-key tests prove catalog, relationship, Baseline, profile, schema, and query changes produce distinct keys.
- Manifest lookup tests prove a non-matching published `inputDigest` is never reused.
- Repository tests cover deterministic batching, idempotent retry, unique row identity, count closure, and atomic publication.
- MCP tests cover authorization, pagination, locale overlays, current/stale state, and no cross-Scope leakage.
- Web tests cover the compact summary, filters, blocker explanation, and unchanged architecture-unit metrics.
- An exact-Scope operational check repairs and reads back all required typed links through MCP.
- A final readback verifies v6 remains `8/42/6`, all eligible current records have one coverage row, `BLOCKED=0`, and the previous v5 and v6 Baselines remain readable.

## Acceptance Criteria

- The published v6 Baseline remains unchanged and queryable as `8/42/6`.
- `generic-system@2` is immutable and has explicit membership, traceability, exemption, and role-specific path rules.
- Every authored record in the pinned exact-Scope catalog has exactly one immutable coverage row.
- The six verified relationship gaps are repaired through MCP and pass ontology validation.
- The published coverage manifest has `BLOCKED=0` and `NOT_EVALUATED=0`; exemptions, if any, have approved reason, owner, evidence, and profile version.
- Catalog or relationship mutations make the old manifest stale and create a different build key.
- Public MCP and Web reads are bounded, paginated, localized, exact-Scope, and based only on materialized coverage rows.
- PostgreSQL remains authoritative; no graph database is required for correctness.
- Repository records, MCP records, typed links, evidence, digests, and Design Change Session IDs agree.

## 中文本地化覆盖

### 状态与背景

- 设计已批准进入书面 Spec，尚未开始实施。
- 所属应用服务为 `com.huawei.celon.desiner`。
- 所属 Scope 路径为 `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`。
- 设计变更会话为 `design-change-session:3f60911b-4a6e-49d8-977d-0391dcea39f3`。
- 英文是规范内容，中文是完整的面向人本地化内容。

Designer 已发布的 v6 架构基线包含 8 个架构单元、42 个直接成员和 6 条跨层映射。它是经过评审的架构快照，并不意味着每项设计资产本身都必须成为架构组件。

精确 Designer Scope 当前共有 293 项已编写记录，其中包括 249 项设计资产、23 项 Proposal 和 21 项 Context Pack。目录既包含 API、事件、规则和数据模型等架构内容，也包含质量要求、ADR 和验证证据。如果把所有记录都作为 3A 直接成员，会把结构、治理和验证混成一个无法阅读的层级。

企业级使用仍然要求系统对每项记录给出确定答案：它直接属于哪个架构单元、它通过什么关系追溯到已分类资产、它为什么被阻塞，或者它为什么获得了明确且受治理的豁免。因此，本设计在保持 v6 架构语义不变的前提下，为整个已编写目录建立完整语义覆盖投影。

### 设计原则与边界

本设计采用通用架构原则：ISO/IEC/IEEE 42010 将关注点、视点、模型类型和架构描述分开；ArchiMate 将结构和行为元素与 Requirement、Constraint 等 Motivation 元素分开；Backstage 也区分 Component、API、Resource 与更高层的 System、Domain，并强调目录图表达人的认知模型，而不是穷举库存。

本阶段保持 v6 为 `8/42/6`，不会为了覆盖率制造 v7，也不会把 Quality、ADR、Evidence、Proposal 或 Context Pack 自动提升为架构成员。系统新增独立、版本化的企业覆盖策略和不可变投影，并通过 MCP 修复已确认的关系缺口。PostgreSQL 始终是权威存储，图数据库只能作为派生投影。

本阶段不改变 v6 单元语义，不在请求时执行任意图遍历，不引入图数据库正确性依赖，不允许跨 Scope 写入，也不会从名称、文件路径、向量相似度或图邻近关系自动编造业务语义。存量扫描、来源责任人确认和持续外部同步仍属于独立能力。

### 覆盖策略

首个策略为不可变的 `generic-system@2`。策略发生变化时必须发布新版本和新投影代次。

每项记录只有一个主要覆盖角色：

- `MEMBERSHIP`：记录是已接受架构单元的直接成员，通常用于领域、API、事件、业务规则、状态机、集成、数据模型/实体/字段、可观测性和应用服务；
- `TRACEABILITY`：记录属于治理或验证关注点，并通过允许的有类型路径连接到已分类成员，通常用于 Quality、ADR、Evidence、Proposal 和 Context Pack；
- `EXEMPTION`：记录有明确的策略版本、原因、负责人和证据，因此被治理性地排除。

v6 中已经接受的 ADR 成员作为历史基线事实保留，但它不能推导出“所有 ADR 都可以成为直接成员”的通用规则。

每条结果的状态为 `COVERED`、`BLOCKED` 或 `NOT_EVALUATED`。有效豁免的状态仍为 `COVERED`，但必须单独统计。悬空端点、方向错误、跨 Scope、类型不匹配和不支持的关系绝不能被豁免隐藏。

### 路径语法

覆盖判定采用有方向、有类型的角色路径语法，最长三条关系，不采用通用 BFS：

- Quality：`quality -VERIFIES-> 已分类成员`；
- ADR：`adr -DECIDES-> 已分类成员`；
- Evidence：`evidence -VALIDATES-> adr -DECIDES-> 已分类成员`；
- Proposal：`proposal -IMPACTS-> 已分类成员`；
- Proposal：`proposal -IMPLEMENTS_DECISION-> adr -DECIDES-> 已分类成员`；
- Context Pack：`contextPack -IMPLEMENTS_CONTEXT_FOR-> proposal -IMPACTS-> 已分类成员`；
- Context Pack：`contextPack -IMPLEMENTS_CONTEXT_FOR-> proposal -IMPLEMENTS_DECISION-> adr -DECIDES-> 已分类成员`。

每条边必须存在于规范有类型关系存储中，满足关系本体的端点类型和方向，处于同一精确 Scope，解析到现存修订，并最终到达固定基线代次中的直接成员。现有数据证明三跳足以覆盖全部受支持治理角色；增加跳数不能修复缺失事实，只会增加误匹配风险。

系统先判断直接成员，再判断追溯关系。没有直接成员的记录继续使用对应角色的追溯规则；存在多个直接成员时，除非固定策略明确允许该资产类型共享，否则结果必须以 `AMBIGUOUS_MEMBERSHIP` 标记为 `BLOCKED`。存在多条合法追溯路径时，投影器依次按最短路径、策略声明的路径优先级、终止成员标识和关系标识确定唯一结果；其他合法路径只能用于诊断统计，不能改变结果摘要。

### 当前核对结果与关系修复

对精确 Designer Scope 的只读核对结果为：2 项 Quality 全部覆盖；23 项非成员 ADR 中 22 项覆盖；182 项 Evidence 中 181 项覆盖；23 项 Proposal 中 20 项覆盖；21 项 Context Pack 中 20 项覆盖。

当前共有 6 项阻塞记录：

- `adr-readable-3a-architecture-mapping-v6`；
- `evidence-designer-3a-v6-semantic-unit-expansion`；
- `proposal-readable-3a-architecture-mapping-v6`；
- `ctx-readable-3a-architecture-mapping-v6`；
- `proposal-agent-service-workspace`；
- `proposal-mcp-native-scoped-seeding`。

加上 42 项 v6 直接成员，当前固定目录完整闭合为 287 项已覆盖和 6 项阻塞，合计正好 293 项已编写记录。

前四项已经形成治理链，但 v6 ADR 缺少指向四项 v6 新成员的 `DECIDES` 关系。后两项 Proposal 的载荷中已声明 `impactedAssets`，但没有同步为规范 `IMPACTS` 关系。载荷引用只是描述输入，不能替代有类型关系事实。

实施时必须通过精确 Scope 的 MCP 为 v6 ADR 增加指向 Web Console、AI 生成、资产图查询和 MCP 审计可观测性资产的 `DECIDES` 关系；为两个孤立 Proposal 增加指向其已声明资产的 `IMPACTS` 关系。所有端点都必须通过关系本体校验，禁止为了指标增加无语义的快捷关系。

### 不可变目录快照

当前 DesignAsset、Proposal 和 Context Pack 表是可变的当前状态表，其中 Context Pack 甚至没有更新时间，因此不能只用时间戳生成可复现的企业投影。

本设计增加按精确 Scope 递增的 `AuthoredCatalogCursor`，以及追加写的 `AuthoredAssetRevision`。每次 MCP 写入或受支持删除都必须在同一 PostgreSQL 事务内递增 `catalogVersion`、写入包含规范载荷和摘要的不可变修订，并更新当前状态表。现有记录通过一次性引导修订建立水位，其摘要必须与当前规范记录一致；该迁移只增加修订元数据，不改变设计语义。

有类型关系继续使用现有 `RelationshipEvent.graphVersion` 作为关系水位。因此每个覆盖投影都同时固定目录版本和关系版本。

### 投影模型与一致性

`ArchitectureCoverageManifest` 保存精确 Scope、代次、v6 基线与投影、策略版本、目录版本和摘要、关系版本和摘要、成员摘要、输入摘要、内容摘要、统计和发布状态。

构建键必须包含精确 Scope、基线、策略、投影 Schema、目录版本/摘要、关系版本/摘要和规范查询输入，不包含尝试次数和时间戳。只有已发布清单的 `inputDigest` 与本次构建键完全一致时才能复用；仅按基线、策略和 Schema 查找已发布结果是禁止的。

`ArchitectureAssetCoverageProjection` 为固定目录中的每项记录保存一条不可变结果，包括资产类型和 ID、来源目录版本和摘要、角色、状态、成员单元或终止成员、原因、诊断引用、最多三跳的关系证据以及行摘要。唯一键由精确 Scope、代次、资产类型和资产 ID 组成。公共读取只查询物化结果，不遍历实时关系图。

构建启动时在一个短事务中固定目录、关系、基线和策略水位；后台任务通过键集分页和确定性批次读取不可变修订，依次判断成员、追溯和豁免，幂等写入结果。只有期望记录都有且只有一条结果、端点和 Scope 闭合、计数与摘要一致时才能原子发布。中断任务可以从检查点恢复，部分代次永远不会显示为 `READY`。

历史清单永远描述固定输入且不可修改。只有目录版本/摘要、关系版本/摘要、基线代次和策略版本仍与当前 Scope 一致时，它才是 `CURRENT`；任一项变化都会使其成为 `STALE`，同时保留历史查询能力并触发新的构建键。

### MCP、页面与规模

新增精确 Scope 的只读 MCP 工具 `get_3a_coverage_report`。它支持选择清单或默认最新已发布代次，支持按角色、状态、资产类型、架构单元和原因过滤，使用受限 `limit` 和不透明键集续传令牌，并返回固定水位、当前/过期状态、摘要、分页结果和部分结果信息。它不能泄露其他 Scope 的资产、计数、端点或诊断，也不会触发任意图遍历。

现有 3A 工作区增加紧凑的只读覆盖摘要和可筛选详情，不增加新的顶级页面。页面分别显示成员覆盖、追溯覆盖、阻塞、豁免、未评估以及当前/过期状态，并解释关系路径或阻塞原因。现有架构单元计数和 `unclassifiedCount` 语义保持不变。

PostgreSQL 保存权威的资产修订、关系事件、清单和覆盖结果。构建使用不可变水位、键集分页、确定性批次和幂等检查点。公共查询只访问带索引的物化结果。图数据库可以消费发布结果用于可视化或分析，但图服务是否可用不能改变覆盖正确性。这使高成本解析按投影代次执行一次，而不是在每次用户请求中扫描大型关系图。

### 失败、验证与验收

Scope、基线、策略、端点、本地化、修订或水位缺失和不匹配时必须关闭失败。目录或关系发生变化时禁止复用旧清单。悬空端点、方向错误、本体类型无效、跨 Scope 路径和不支持的路径都必须产生 `BLOCKED`。摘要或计数不一致时禁止发布。MCP 设计事实同步失败时必须记录 `MCP synchronization blocked`，并禁止宣称完成。

测试必须覆盖全部角色和路径语法、错误方向、错误端点类型、跨 Scope、悬空端点、豁免规则、固定水位、构建键变化、错误清单复用、确定性批次、幂等重试、原子发布、MCP 授权和分页，以及页面摘要和筛选。操作核验必须通过 MCP 修复并回读全部关系。

最终验收要求：v6 仍可按 `8/42/6` 查询；`generic-system@2` 不可变；固定目录中的每项记录恰有一条覆盖结果；六项断链已通过 MCP 修复；已发布清单的 `BLOCKED=0` 且 `NOT_EVALUATED=0`；任何豁免都有原因、负责人、证据和策略版本；目录或关系变化会产生新构建键并使旧结果过期；MCP 与页面读取受限、分页、本地化且严格隔离 Scope；PostgreSQL 保持权威；仓库记录、MCP 记录、关系、证据、摘要和会话 ID 完全一致。
