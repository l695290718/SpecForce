# Enterprise Continuous Inbound Connectors

## Status

Approved design; implementation has not started.

- Owning application service: `com.huawei.celon.desiner`
- Owning scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Design Change Session: `design-change-session:526f9b9f-3d19-40d8-bab8-7a9922b8187f`
- Related decisions: `adr-federated-design-fact-synchronization`, `adr-continuous-observation-governance`

## Purpose

Complete the provider-neutral continuous inbound synchronization platform without pretending that unknown vendor APIs are supported. Existing application services must be able to observe PostgreSQL schemas, OpenAPI contracts, CMDB-style catalogs, and aggregated runtime service catalogs through exact-Scope, resumable connectors. External observations remain evidence and candidates until governed MCP promotion makes them authoritative SpecForge facts.

This increment extends the implemented `continuous-observation/v1` receiving boundary and local-repository connector. It does not replace the Agent-driven baseline workflow, make graph storage authoritative, or introduce direct mutation of external systems.

## Goals

- Represent complete snapshots and incremental changes without unsafe deletion inference.
- Resume after process, network, or source failures from PostgreSQL-authoritative checkpoints.
- Run connector workers safely in single-node Docker Compose and future multi-instance deployments.
- Deliver working PostgreSQL Schema and OpenAPI adapters.
- Deliver a versioned declarative REST/JSON catalog adapter for CMDB and aggregated runtime catalogs.
- Drive accepted observations through identity matching, candidate generation, review, MCP promotion, reconciliation, and impact projection.
- Preserve exact application-service Scope isolation, source minimization, secret separation, bilingual governance, and auditable evidence.

## Non-Goals

- CodeHub or CodeArts protected-branch enforcement.
- Enterprise identity-provider integration.
- Outbound Proposal delivery or external `APPLY`.
- Claims of support for undocumented Huawei CMDB, APIG, or APM private interfaces.
- Storage or processing of raw traces, logs, or metrics.
- Automatic promotion of business semantics.
- Billion-scale capacity certification.

## Architectural Boundaries

PostgreSQL remains authoritative for connector definitions, instances, schedules, runs, leases, batch receipts, source observations, identity mappings, candidates, conflicts, reconciliation, and transactional Outbox events. MCP remains the only authored system-of-record write boundary for accepted design facts and typed links. NebulaGraph receives only derived projections of governed facts.

The delivery separates five responsibilities:

1. **Source adapters** read external systems and emit normalized, bounded pages.
2. **Connector worker** schedules runs, owns leases, retries transient failures, and submits pages.
3. **Continuous receiving boundary** validates Scope, contract, sequence, digest, snapshot, and source identity before atomic persistence.
4. **Observation processor** consumes Outbox events and produces identity matches, candidates, tombstones, conflicts, and Review Bundles.
5. **Governed publication** uses existing MCP promotion, read-only reconciliation, and impact projection.

No adapter writes authored assets directly. No failed or partial run changes the active Baseline or authoritative dashboard counts.

## Observation Contract V2

Introduce `continuous-observation/v2` while retaining v1 compatibility for existing streams. A stream cannot change contract version in place. An upgraded connector starts a new versioned source namespace or completes an explicit migration with an auditable checkpoint.

### Run and page envelope

Each submitted page includes:

- exact `architectureScope`;
- `connectorId` and versioned `sourceNamespace`;
- stable `runId`;
- the active lease fencing token;
- `mode`: `FULL_SNAPSHOT` or `DELTA`;
- `snapshotId` for full snapshots;
- `mappingVersion` and mapping digest;
- an inventory-boundary digest covering source selection, exclusions, and visibility policy;
- monotonically increasing stream sequence and previous-batch digest;
- page index, source cursor, source high-water mark, and `isLastPage`;
- source version, observation time, coverage metadata, payload digest, and batch digest.

Each observation includes:

- `operation`: `UPSERT` or `TOMBSTONE`;
- stable external type and external ID;
- source version and source timestamp when available;
- normalized payload for `UPSERT`;
- deletion reason and prior identity reference for `TOMBSTONE`;
- provenance and evidence references allowed by source-minimization policy.

### Snapshot safety

A full snapshot is `COMPLETE` only after every page is accepted in order and the terminal page is committed. The server records identities seen by the run. Only successful finalization may compare that complete identity set with the previous complete snapshot for the same inventory-boundary digest and create tombstone candidates for missing identities. A changed selection, exclusion, or visibility boundary requires a rebuild and review; it cannot infer deletion from the prior boundary.

A failed, cancelled, expired, incomplete, or coverage-limited snapshot cannot infer deletion. A delta stream must send an explicit tombstone event; temporary absence is not deletion.

Mapping-version changes require a rebuild run. Results from different mapping versions cannot be merged into one complete snapshot. Mapping migration preserves previous observations and identity mappings until the replacement snapshot is complete and reviewed.

## Persistent Runtime Model

The existing `ConnectorInstance` is extended rather than replaced. The implementation adds durable records equivalent to:

- `ConnectorDefinition`: kind, contract, capabilities, configuration schema, and supported mapping versions;
- `ConnectorRun`: mode, source watermarks, snapshot identity, coverage, lifecycle state, and terminal summary;
- `ConnectorLease`: owner, fencing token, heartbeat, and expiration;
- `ConnectorDeadLetter`: rejected work, failure classification, retry eligibility, and replay audit;
- `ConnectorHealthSnapshot`: freshness, lag, failure streak, last success, and latest reconciliation state.

Run states are `QUEUED`, `LEASED`, `RUNNING`, `FINALIZING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, and `QUARANTINED`. A run is successful when source observations are durably accepted; design convergence remains a separate reconciliation result.

## Connector Worker

Add a dedicated `connector-worker` process and Docker Compose service. It shares the application packages and PostgreSQL authority but is independently deployable and scalable.

- Workers claim due runs through PostgreSQL leases with fencing tokens. Every submitted page carries the current token, and the receiving transaction rejects a stale or non-owning token.
- One stream has at most one effective writer.
- Heartbeats renew ownership; an expired lease may be recovered by another worker.
- Checkpoints advance only with accepted batches.
- Transient failures use bounded exponential backoff with jitter.
- Scope, authorization, contract, mapping, and credential failures suspend or quarantine the run instead of retrying forever.
- Dead letters are inspectable and replayable through MCP; replay repeats all original Scope and digest checks.
- Manual trigger, pause, resume, status, and replay are MCP operations.
- Read-only UI surfaces health and freshness only for Scopes readable by the current principal.

The same lease semantics apply to local single-node and later multi-instance deployments. Process-local timers are not the source of truth.

## Secret and Network Boundary

Connector credentials are referenced, never embedded in connector payloads, logs, observations, design assets, or MCP responses. The initial secret resolver supports environment-variable references and Docker Secrets. Its interface allows a later Vault or enterprise secret-provider implementation without changing adapter contracts.

Secrets are resolved only in the worker, held for the minimum operation lifetime, and redacted from structured errors. Credential validation is a distinct operation and cannot return secret material.

HTTP adapters enforce HTTPS by default, explicit host allowlists, bounded redirects, DNS/IP revalidation, private-network policy, response-size limits, content-type checks, timeouts, and decompression budgets. These controls prevent connector configuration from becoming an SSRF or resource-exhaustion path.

## PostgreSQL Schema Adapter

The PostgreSQL adapter uses a read-only role and queries `pg_catalog` and `information_schema`; it never reads business table rows.

It observes:

- databases and schemas;
- tables, partitioned tables, views, and materialized views;
- columns, data types, nullability, defaults, and generated expressions;
- primary, foreign, unique, and check constraints;
- indexes, enums, domains, sequences, and function signatures;
- object comments and owners as evidence;
- deterministic dependencies available from PostgreSQL catalogs.

Stable identity is derived from database, schema, object kind, and catalog identity. Display names are not standalone identity keys. The adapter performs a transactionally consistent full catalog snapshot where supported, emits bounded pages, and finalizes only after all selected schemas are covered. Exclusion policies and insufficient permissions are explicit coverage gaps.

## OpenAPI Adapter

The OpenAPI adapter supports version 3.0 and 3.1 documents from approved local files or HTTPS URLs. It observes APIs, operations, parameters, request and response schemas, error responses, security schemes, servers, tags, and typed references.

- Content digest is the correctness key; ETag and Last-Modified are optimization hints.
- Local and remote `$ref` resolution is bounded by depth, document count, host allowlist, and total bytes.
- Unsupported or cyclic references become visible coverage issues.
- Stable operation identity uses normalized document identity plus explicit `operationId` when unique, otherwise method and normalized path.
- Schema identity follows canonical component references rather than display titles.

This adapter proves a published API contract. It does not claim API-gateway deployment state, traffic, policy, or route activation.

## Declarative Catalog Adapter

Provide a versioned REST/JSON mapping adapter for CMDB-style inventories and aggregated runtime service catalogs.

A mapping profile is data, not executable code. It uses a bounded schema of JSON Pointer selectors, typed transforms, and stable-ID templates; arbitrary JavaScript, shell commands, and dynamic module loading are forbidden. A profile declares:

- endpoint and pagination strategy;
- full-snapshot or delta semantics;
- source cursor and high-water extraction;
- collection and object paths;
- stable external ID expression;
- asset type, field, and relationship mappings;
- tombstone extraction where the source exposes deletion events;
- evidence time window and expiry for runtime observations;
- mapping schema version, profile version, and digest.

Profiles without a stable external identity are rejected. Mapping changes require a rebuild snapshot. Full results may infer tombstones only after complete finalization; delta results require explicit deletion events.

Runtime profiles accept aggregated service, instance, deployment, endpoint, and service-dependency records. Raw traces, logs, and metrics remain in the enterprise observability platform. Runtime evidence expires to `STALE`; expiry is not deletion and cannot directly remove an authored architecture fact.

Vendor-specific authentication, streaming protocols, or semantics that cannot be represented by the mapping profile require a separate adapter and ADR. Generic mapping support must not be described as verified support for an unknown vendor API.

## Observation Processing and Governance

An accepted batch and its Outbox event are committed atomically. The observation processor claims events idempotently and performs:

1. schema-aware normalization and digest calculation;
2. exact-Scope external identity matching;
3. field-level authority-policy evaluation;
4. candidate, tombstone, conflict, or unchanged classification;
5. risk-tiered Review Bundle creation;
6. MCP-governed promotion of approved candidates;
7. read-only reconciliation;
8. impact-analysis and graph projection only after governed facts change.

The default promotion mode is `REVIEW`. Future `AUTO` policy is limited to deterministic, low-risk technical fields that are explicitly external-authoritative. Business meaning, rules, ownership, decisions, and other human semantics cannot be automatically promoted.

Accepted human-facing facts require English canonical fields and complete Chinese localization. Raw observations may retain source-language text, but missing localization blocks promotion when the target fact is human-facing.

Multiple sources claiming one external or SpecForge identity are resolved by field-level authority policy. Missing or competing authority creates a conflict; last-writer-wins is forbidden. Cross-Scope dependencies remain unresolved external-reference candidates unless the caller has target-Scope permission and the relationship is reviewed in both required boundaries.

Tombstones default to a deprecation proposal and preserve history. Physical deletion is not part of connector processing.

## Reconciliation and Meaning of Success

The implementation distinguishes three independent outcomes:

- **Run succeeded:** every required source page was durably accepted.
- **Review completed:** every blocking candidate, tombstone, and conflict has a governed decision.
- **Scope converged:** promoted facts, localization, evidence, relationships, delivery state, and source observations pass read-only reconciliation.

Only the third outcome means design and observed implementation are consistent. Connector HTTP success, cursor freshness, or an empty candidate queue cannot independently claim convergence.

Source-unreachable, incomplete-snapshot, stale-runtime, pending-review, identity-conflict, content-drift, relationship-drift, and delivery-blocked states remain distinguishable in storage, MCP output, and read-only UI.

## Failure Handling

- Duplicate batches with identical digests are idempotent.
- Sequence gaps, broken hash chains, conflicting retries, Scope mismatch, and unsupported contract versions fail closed.
- A partial snapshot retains its diagnostics but cannot supersede the prior complete snapshot.
- Connector revocation stops new claims and prevents later batch acceptance.
- Credential failures suspend the connector and expose a redacted operational error.
- Mapping failures quarantine the run without advancing the source checkpoint.
- Worker loss is recovered through lease expiry and fencing.
- Dead-letter replay is explicit, audited, and idempotent.
- Source outages leave accepted facts and active Baselines unchanged.

## Deployment and Operations

Docker Compose starts Web, MCP Server, connector worker, and PostgreSQL as one product deployment. The worker has its own health check and can be disabled when no continuous connector is configured. Production installations may point every service to externally deployed PostgreSQL and secret providers through connection configuration.

Operational metrics include run duration, lease age, observation lag, source freshness, page and byte counts, candidate volume, conflict age, dead-letter count, Outbox lag, reconciliation state, and per-Scope convergence. Metrics and dashboards cannot aggregate unauthorized Scope data.

Run identity sets and immutable observations are append-oriented and partitionable by Scope, connector, and time. Completed-run staging identities have a bounded retention policy after tombstone derivation and audit sealing. Retention may compact operational payloads but cannot remove promotion evidence, batch receipts, reconciliation receipts, or audit digests required to reproduce a governed decision.

## Testing Strategy

- Contract tests cover v1 compatibility, v2 full and delta modes, page ordering, digests, budgets, and tombstones.
- Property tests cover idempotency, stable identity, cursor monotonicity, and snapshot finalization.
- PostgreSQL integration tests cover atomic receipt, cursor, observations, run state, identity set, Outbox, and rollback.
- Failure-injection tests cover process loss, lease takeover, stale fencing-token rejection, transient source failure, credential revocation, dead letters, and replay.
- Security tests cover exact-Scope isolation, sibling denial, secret redaction, HTTPS policy, SSRF, redirects, decompression, and size limits.
- Adapter golden tests cover PostgreSQL catalogs, OpenAPI 3.0/3.1, references, declarative mappings, pagination, and mapping upgrades.
- Deletion tests prove incomplete snapshots and changed inventory boundaries never infer tombstones, while a complete same-boundary snapshot does.
- Governance tests cover identity ambiguity, authority conflicts, localization gates, Review Bundles, promotion, reconciliation, and impact triggers.
- End-to-end tests perform initial discovery, unchanged retry, delta change, source deletion, review, MCP promotion, PostgreSQL read-back, and convergence.
- Docker smoke tests prove one-command startup, schema creation, worker health, and restart recovery.

## Acceptance Criteria

1. PostgreSQL and OpenAPI sources can complete bounded, resumable full snapshots in an exact application-service Scope.
2. Declarative catalog profiles can ingest a representative paginated CMDB inventory and aggregated runtime catalog with stable identities.
3. Duplicate delivery is idempotent, sequence gaps fail closed, and worker takeover resumes from the last accepted checkpoint.
4. No incomplete scan can infer deletion or replace a prior complete snapshot.
5. Complete-snapshot absence and explicit delta deletion create reviewable tombstone candidates while preserving history.
6. Accepted observations flow through identity matching, Review Bundles, MCP promotion, authoritative read-back, and read-only reconciliation.
7. Source credentials never enter persisted observations, logs, design facts, or MCP responses.
8. Current-Scope UI and MCP health views distinguish run success, pending review, source freshness, and convergence.
9. Docker Compose starts and recovers the connector worker with PostgreSQL-authoritative leases and checkpoints.
10. The active backlog item for generic legacy connectors and continuous inbound synchronization may close only after matching ADR, Proposal, Context Pack, Evidence, typed links, MCP read-back, and focused tests converge.

## Deferred Follow-Up

The following remain separate backlog facts: CodeHub enforcement, enterprise IdP, vendor-specific Huawei connectors, outbound Proposals, external `APPLY`, raw telemetry processing, automated business-semantic promotion, production secret-provider plugins, and billion-scale certification.

---

## 中文本地化

### 状态

设计已批准，尚未开始实施。

- 所属应用服务：`com.huawei.celon.desiner`
- 所属 Scope 路径：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 设计变更会话：`design-change-session:526f9b9f-3d19-40d8-bab8-7a9922b8187f`
- 相关决策：`adr-federated-design-fact-synchronization`、`adr-continuous-observation-governance`

### 目的

完成与厂商无关的持续入站同步平台，同时禁止把未知厂商接口描述为已经支持。现有应用服务应能通过精确 Scope、可恢复连接器观察 PostgreSQL Schema、OpenAPI 契约、CMDB 类目录和聚合运行时服务目录。外部观察始终先作为证据和候选，只有通过受治理的 MCP 提升后才能成为 SpecForge 权威事实。

本增量扩展已经实现的 `continuous-observation/v1` 接收边界和本地仓库连接器。它不替代 Agent 驱动的存量基线流程，不把图数据库变成权威存储，也不直接修改外部系统。

### 目标

- 安全表达完整快照和增量变化，不进行不可靠的删除推断。
- 以 PostgreSQL 权威检查点从进程、网络或来源故障中恢复。
- 在单节点 Docker Compose 和未来多实例部署中安全运行连接器 Worker。
- 交付可工作的 PostgreSQL Schema 和 OpenAPI 适配器。
- 交付用于 CMDB 和聚合运行时目录的版本化 REST/JSON 声明式适配器。
- 让已接收观察进入身份匹配、候选生成、评审、MCP 提升、对账和影响投影闭环。
- 保持精确应用服务 Scope 隔离、来源最小化、密钥分离、双语治理和可审计证据。

### 非目标

本阶段不交付 CodeHub/CodeArts 受保护分支门禁、企业 IdP、出站 Proposal、外部 `APPLY`、未知华为 CMDB/APIG/APM 私有接口、原始 Trace/日志/指标存储、业务语义自动提升或亿级容量认证。

### 架构边界

PostgreSQL 对连接器定义、实例、调度、运行、租约、批次收据、来源观察、身份映射、候选、冲突、对账和事务 Outbox 保持权威。MCP 仍是正式设计事实和类型化关系唯一的系统记录写入边界。NebulaGraph 只接收受治理事实的派生投影。

交付拆分为五项职责：来源适配器读取外部系统并产生有界页面；连接器 Worker 调度运行、持有租约、处理重试并提交页面；持续接收边界在原子持久化前校验 Scope、契约、序列、摘要、快照和来源身份；观察处理器消费 Outbox 并生成身份匹配、候选、墓碑、冲突和 Review Bundle；受治理发布继续使用 MCP 提升、只读对账和影响投影。

任何适配器都不能直接写正式资产。失败或不完整的运行不能改变活动 Baseline 或权威仪表盘数字。

### V2 观察契约

新增 `continuous-observation/v2`，同时保留已有流的 v1 兼容性。流不能原地切换契约版本；升级后的连接器必须使用新的版本化来源命名空间，或通过具有审计记录的显式迁移完成切换。

每个页面携带精确 Scope、连接器与来源命名空间、稳定 `runId`、当前租约围栏令牌、`FULL_SNAPSHOT` 或 `DELTA` 模式、快照 ID、映射版本与摘要、覆盖来源选择/排除/可见性策略的清单边界摘要、流序号和前批摘要、页序号、来源游标、水位、末页标记、来源版本、观察时间、覆盖信息及内容摘要。

每条观察携带 `UPSERT` 或 `TOMBSTONE` 操作、稳定外部类型和 ID、来源版本和时间、更新负载或删除原因，以及符合来源最小化政策的证据与出处。

完整快照只有在全部页面按序接收且末页提交后才进入 `COMPLETE`。服务端记录本次运行已出现的身份，只有成功完成后才能与具有相同清单边界摘要的上一完整快照比较，并为缺失身份生成 Tombstone 候选。来源选择、排除或可见性边界变化必须重建并评审，不能根据旧边界推断删除。失败、取消、超时、分页缺失或覆盖不完整的快照禁止推断删除。增量流必须显式发送 Tombstone，暂时未观察到不能解释为删除。

映射版本变化必须发起重建运行。不同映射版本的结果不能混入同一个完整快照；替代快照完成并评审前，原有观察和身份映射继续保留。

### 持久运行模型与 Worker

在保留现有 `ConnectorInstance` 的基础上，新增等价于 Connector Definition、Connector Run、Connector Lease、Connector Dead Letter 和 Connector Health Snapshot 的持久记录。运行状态包括 `QUEUED`、`LEASED`、`RUNNING`、`FINALIZING`、`SUCCEEDED`、`FAILED`、`CANCELLED` 和 `QUARANTINED`。

新增独立 `connector-worker` 进程和 Docker Compose 服务。Worker 使用带围栏令牌的 PostgreSQL 租约领取任务；一条流最多只有一个有效写入者。每个提交页面必须携带当前围栏令牌，接收事务拒绝过期令牌或非持有者令牌。心跳续租，租约过期后其他实例可以接管；检查点只随已接收批次推进。临时错误使用带抖动的有界指数退避，Scope、权限、契约、映射和凭据错误则暂停或隔离运行。

Dead Letter 可通过 MCP 查看和重放，重放仍执行原始 Scope 和摘要检查。手工触发、暂停、恢复、状态查看和重放均通过 MCP。页面只读展示当前主体有权 Scope 的健康度和新鲜度。

“运行成功”只表示来源观察已持久接收；“设计收敛”必须由独立对账证明，二者不能混用。

### 密钥与网络边界

连接器只保存 Secret Reference，禁止把凭据写入负载、日志、观察、设计资产或 MCP 响应。首期 Secret Resolver 支持环境变量引用和 Docker Secret，并预留 Vault 或企业密钥服务接口。密钥只在 Worker 内按最短生命周期解析，结构化错误必须脱敏。

HTTP 适配器默认要求 HTTPS，并实施主机白名单、重定向限制、DNS/IP 复核、私网策略、响应大小、内容类型、超时和解压预算，防止 SSRF 和资源耗尽。

### PostgreSQL Schema 适配器

适配器使用只读账号查询 `pg_catalog` 和 `information_schema`，不读取业务表数据。采集数据库、Schema、表、分区表、视图、字段、类型、默认值、主外键、唯一约束、检查约束、索引、枚举、域、序列、函数签名、注释、所有者和可确定依赖。

稳定身份由数据库、Schema、对象类型和目录身份组成，显示名不能单独作为身份。适配器在能力允许时执行事务一致的完整目录快照，按页输出；只有所有选定 Schema 覆盖完成后才可结束。排除策略和权限不足必须作为显式覆盖缺口。

### OpenAPI 适配器

支持从批准的本地文件或 HTTPS URL 读取 OpenAPI 3.0/3.1，采集 API、Operation、参数、请求/响应 Schema、错误响应、安全方案、Server、Tag 和类型化引用。内容摘要是正确性依据，ETag 和 Last-Modified 仅用于优化。

本地和远程 `$ref` 解析受深度、文档数、主机白名单和总字节预算限制；不支持或循环引用成为可见覆盖问题。Operation 优先使用唯一 `operationId`，否则使用方法和规范化路径形成稳定身份；Schema 使用规范组件引用而非显示标题。

该适配器只能证明已发布 API 契约，不能宣称网关部署状态、流量、策略或路由激活情况。

### 声明式目录适配器

提供版本化 REST/JSON 映射适配器，用于 CMDB 类清单和聚合运行时服务目录。映射 Profile 是数据而不是可执行代码，只允许受约束的 JSON Pointer、类型化转换和稳定 ID 模板；禁止任意 JavaScript、Shell 命令和动态模块加载。Profile 声明端点、分页、全量或增量语义、来源游标和水位、数据路径、稳定外部 ID、资产类型、字段和关系映射、删除事件、运行时证据窗口、Schema 版本、Profile 版本及摘要。

缺少稳定外部身份的 Profile 必须拒绝启动。映射变化要求重建快照。只有完整全量结果可以推断 Tombstone，增量结果必须显式包含删除事件。

运行时 Profile 只接收聚合的服务、实例、部署、端点和服务依赖记录；原始 Trace、日志和指标留在企业可观测平台。运行时证据过期后进入 `STALE`，过期不是删除，也不能直接删除正式架构事实。

无法由 Profile 表达的厂商认证、流协议或语义需要独立适配器和 ADR。通用映射能力不得被描述为已经验证某个未知厂商接口。

### 观察处理与治理

接收批次及其 Outbox 事件在同一事务提交。观察处理器幂等消费事件，完成 Schema 感知标准化、精确 Scope 身份匹配、字段级权威策略判断、候选/墓碑/冲突分类、风险分级 Review Bundle、MCP 受治理提升、只读对账，以及正式事实变化后的影响分析和图投影。

默认提升模式为 `REVIEW`。未来 `AUTO` 只能用于明确由外部来源权威、确定且低风险的技术字段。业务含义、规则、所有权、决策及其他人类语义不得自动提升。

正式的人类可读事实必须具备英文规范字段和完整中文覆盖。原始观察可以保留来源语言，但目标为人类可读事实时，缺少本地化必须阻止提升。

多个来源声明同一身份时，由字段级 Authority Policy 决定；缺少权威或权威冲突必须创建冲突，禁止最后写入者获胜。跨 Scope 依赖在没有目标 Scope 权限和必要评审时只能保留为未解析外部引用候选。

Tombstone 默认形成弃用建议并保留历史；连接器处理不执行物理删除。

### 对账与成功定义

系统明确区分三种结果：运行成功表示全部必要来源页面已经持久接收；评审完成表示阻塞候选、墓碑和冲突已有治理决策；Scope 收敛表示正式事实、本地化、证据、关系、交付状态和来源观察通过只读对账。

只有 Scope 收敛才能表示设计与观察到的实现一致。HTTP 成功、游标新鲜或候选队列为空都不能单独证明收敛。来源不可达、快照不完整、运行时过期、待评审、身份冲突、内容漂移、关系漂移和交付阻塞必须在存储、MCP 和页面中保持可区分。

### 失败处理

相同摘要的重复批次保持幂等；序列缺口、哈希链断裂、冲突重试、Scope 不匹配和不支持的契约版本全部失败关闭。部分快照保留诊断但不能替代上一完整快照。连接器被撤销后不能领取新任务或接收后续批次。凭据失败会暂停连接器并暴露脱敏错误；映射失败隔离运行且不推进检查点；Worker 丢失通过租约到期和围栏机制恢复；Dead Letter 重放必须显式、可审计且幂等；来源故障不能改变正式事实和活动 Baseline。

### 部署与运维

Docker Compose 将 Web、MCP Server、Connector Worker 和 PostgreSQL 作为一个产品部署启动。Worker 拥有独立健康检查；没有配置持续连接器时可以禁用。生产环境可以通过连接配置使用外部 PostgreSQL 和密钥服务。

运维指标包括运行耗时、租约年龄、观察延迟、来源新鲜度、页数和字节数、候选数量、冲突时长、Dead Letter 数、Outbox 延迟、对账状态和每 Scope 收敛状态。指标和仪表盘不得聚合无权 Scope 的数据。

运行身份集合和不可变观察采用可按 Scope、连接器和时间分区的追加模型。完成 Tombstone 推导和审计封存后，运行期暂存身份执行有界保留策略。保留策略可以压缩运维负载，但不得删除重放治理决策所需的提升证据、批次收据、对账收据或审计摘要。

### 测试与验收

测试覆盖 v1 兼容、v2 全量/增量、分页、摘要、预算、Tombstone、幂等、稳定身份、游标单调性、快照完成、PostgreSQL 原子事务、Worker 故障接管、凭据撤销、Dead Letter、重放、精确 Scope 隔离、兄弟 Scope 拒绝、密钥脱敏、HTTPS/SSRF、OpenAPI 3.0/3.1、声明式映射、映射升级、删除安全、权威冲突、双语门禁、Review Bundle、MCP 提升、权威库回读、只读对账和 Docker 一键启动恢复。

验收要求 PostgreSQL、OpenAPI 和代表性的声明式 CMDB/运行时目录完成有界可恢复同步；重复投递幂等；序列缺口失败关闭；Worker 接管从最后检查点恢复；不完整快照永不推断删除；完整缺失和显式删除形成可评审 Tombstone；观察进入身份匹配、评审、MCP 提升、回读和对账闭环；密钥不泄露；页面和 MCP 区分运行成功、待评审、新鲜度与收敛。

只有在匹配 ADR、Proposal、Context Pack、Evidence 和类型化关系通过 MCP 同步、回读和聚焦测试后，通用存量连接器与持续入站同步待办才可关闭。

### 延期项

CodeHub 门禁、企业 IdP、华为专用连接器、出站 Proposal、外部 `APPLY`、原始遥测处理、业务语义自动提升、生产密钥服务插件和亿级容量认证继续作为独立待办。
