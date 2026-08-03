# Agent-Driven Legacy Baseline Production Design

## Status

**Approved and implemented for Phase 1 on 2026-08-03. Local stage verification, exact-Scope MCP synchronization/read-back, federation reconciliation, and exact design-session closure passed. Phases 2-5 remain deferred.**

- Owning `architectureScope.applicationServiceId`: `com.huawei.celon.desiner`
- Owning `architectureScope.scopePath`: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Supersedes the production implementation boundary in `2026-08-01-agent-driven-legacy-baseline-discovery-design.md`
- Preserves the existing scanner foundation, MockAI candidate generation, deterministic identity matching, exact-Scope governance, and PostgreSQL authority

## Purpose

SpecForge must let an enterprise user establish a trustworthy Baseline v1 for an existing application service by using an already available coding Agent such as Claude Code or OpenCode. The user must not deploy a scanner daemon, upload an unrestricted source archive, or grant an importer direct PostgreSQL access.

The production path combines a server-signed Scanner release, an exact-Scope Scan Session, a local standalone CLI, deterministic evidence extraction, Agent-generated semantic candidates, risk-tiered review, transactional promotion into canonical design assets and relationships, immutable Baseline publication, and read-only reconciliation.

## Current Implementation Baseline

Phase 1 now provides exact application-service Scope authorization, Design Change Sessions, a pretrusted Ed25519 scanner release contract, a standalone Go scanner, safe workspace traversal, static evidence extractors, resumable hash-chained batches, provider-neutral Agent semantic candidate submission, deterministic identity matching, T0-T3 risk policy, actor separation, atomic canonical promotion, durable reconciliation, immutable Baseline publication, release operations, and focused production proof.

`pnpm legacy-baseline:verify` passed contract drift, Go tests/build, 155 Core tests, scanner/knowledge tests, PostgreSQL integration, real signed-binary end-to-end behavior, a 100,000-observation bounded scale run, typecheck, and production build. The local Windows build disables standalone trace copying only for the verifier because OneDrive/pnpm symlink creation is restricted; Docker/Linux retains standalone output. The native GitHub release workflow is configured but is not claimed as remotely executed evidence.

Continuous observation, live enterprise connectors, deterministic 3A projections, CodeHub enforcement, production object storage, graph projection, and complete billion-scale certification remain outside Phase 1.

## Goals

- Run discovery locally through a signed, versioned, cross-platform `specforge` CLI.
- Bind every scan operation permanently to one server-authorized application-service Scope.
- Extract reproducible APIs, events, data models, state transitions, dependencies, constraints, tests, deployment descriptors, and documentation evidence.
- Keep deterministic observations distinct from Agent-inferred semantics and accepted design facts.
- Resume interrupted large scans through ordered, idempotent batches.
- Review candidates at enterprise scale through T0-T3 policy without losing per-fact auditability.
- Materialize approved candidates into canonical bilingual assets, typed relationships, Evidence, Outbox events, and one atomic ChangeSet.
- Publish and reconcile an immutable Baseline v1 without changing the previous active Baseline on any failed or partial run.

## Non-Goals

- Continuous CI scanning, live runtime discovery, CMDB or API-gateway connectors, outbound patches, and external `APPLY` remain separate increments.
- The Scanner does not infer business intent and does not invoke a model.
- The Scanner does not execute repository build scripts, project hooks, package managers, dynamic libraries, or repository-provided plugins.
- The first increment does not automatically merge facts across application-service Scopes.
- A graph database is not an authoring authority and is not required to publish Baseline v1.

## Trust Architecture

### Scanner Release Authenticity

The SpecForge release pipeline builds platform-specific `specforge` binaries and emits a `ScannerReleaseManifest`. The manifest contains the release ID, CLI version, platform and architecture, binary SHA-256 digest, Scan Contract version, statically compiled extractor IDs and versions, minimum and maximum compatible MCP protocol versions, build provenance digest, SBOM digest, release time, expiry policy, and revocation state.

The release manifest is signed with an Ed25519 release key. The CLI or Agent integration pack must verify the manifest against an explicitly configured trusted public key or enterprise trust bundle. Trust-on-first-use is forbidden. Key IDs support overlap during rotation; revoked keys and releases fail closed. Rollback to an older release requires an explicit server policy allowance.

Signing bytes use UTF-8 RFC 8785 canonical JSON with the `signature` field excluded. The manifest carries `algorithm=Ed25519`, `keyId`, and a base64 signature; the trust bundle carries base64-encoded raw 32-byte Ed25519 public keys. Go and TypeScript use the same Golden Fixture to verify canonical bytes and signatures.

### Scan Session Authority

MCP creates a `ScanSession` only after resolving one exact authorized application service. The Session stores its authoritative Scope, actor, connector instance, repository identity policy, allowed release ID, Scan Contract version, random server nonce, batch limits, evidence policy, parser policy, creation time, expiry time, and state.

The Agent and Scanner receive an opaque Session ID and policy document. They cannot choose or override `scopePath`. Any Scope echoed by a client is informational and must exactly match the Session or be rejected. Parent or sibling grants do not authorize the Session.

### Result Integrity

The Scanner does not contain a private signing key and does not claim to prove its own trustworthiness. Each batch binds the Session ID, server nonce, release digest, repository snapshot digest, sequence number, previous batch digest, payload digest, and final Scan Contract version. The server validates this digest chain before accepting finalization.

Payload, batch, cumulative, manifest, and repository-snapshot digests are lowercase hexadecimal SHA-256 over the canonical contract bytes. The Session stores only the nonce digest after the nonce is returned once to the authorized Agent.

Transport authentication identifies the Agent and authorizes the Session. Release signatures prove binary authenticity. The batch chain proves result integrity and ordering. These concerns remain separate.

## Components

### Provider-Neutral Agent Integration Pack

The integration pack defines one common workflow and structured result schema for Claude Code, OpenCode, and compatible Agents. Vendor wrappers may simplify installation but cannot alter protocol semantics.

The pack instructs the Agent to:

1. list authorized application services;
2. ask the user to select one service;
3. create or resume a Scan Session;
4. obtain and verify the approved release manifest and Scanner binary;
5. run `specforge scan` in the selected workspace;
6. upload deterministic batches through MCP;
7. inspect evidence clusters and submit semantic candidate batches;
8. present coverage, conflicts, review requirements, and publication results; and
9. reconcile the published Baseline.

The integration pack does not require a real server-side AI Provider. The external coding Agent performs semantic analysis locally and submits a standardized candidate payload with Agent identity, model identity when available, prompt-pack version, evidence references, confidence, counter-evidence, and unresolved questions. MockAIProvider remains available for deterministic development and contract tests.

### Standalone Scanner CLI

`apps/specforge-cli` gains a `scan` command and remains a single cross-platform executable. The Scanner has no PostgreSQL credentials. It does not write SpecForge facts and does not call design-write APIs directly. By default it has no outbound network requirement: it can write deterministic batches to a bounded local spool directory, and the Agent transports them through MCP.

The Scanner enforces a resolved workspace root, rejects path traversal and symlink escape, ignores binary and generated directories by policy, applies file and session budgets, redacts prohibited evidence before output, and never follows repository instructions as executable commands.

### Static Extractor Registry

The first release contains only statically compiled, first-party extractors. Runtime loading of repository plugins, shared libraries, scripts, or downloaded parser code is forbidden.

The registry covers:

- repository and build manifests;
- OpenAPI operations, schemas, parameters, responses, and security declarations;
- AsyncAPI channels, messages, producers, and consumers;
- Prisma models and migrations;
- SQL tables, columns, keys, constraints, indexes, and migration statements;
- common Java/Spring routes, persistence entities, events, and state declarations;
- common TypeScript/Node routes, ORM declarations, events, and state declarations;
- common Go HTTP routes, persistence declarations, events, and state declarations;
- test references, configuration, deployment descriptors, and Markdown documentation.

Every extractor declares its ID, version, supported languages/frameworks, supported file patterns, observation types, and coverage limitations. Unsupported frameworks and parser failures create explicit Coverage Gaps. They never silently count as complete.

### Versioned Scan Contract

A language-neutral JSON Schema is the canonical Scan Contract. TypeScript and Go types are generated from the same schema and verified against shared Golden Fixtures.

Every Observation includes:

- stable observation ID and observation type;
- architecture layer and aspect hint when deterministic;
- repository identity and immutable commit or dirty-snapshot digest;
- normalized relative path, symbol, and line range when available;
- parser ID and version;
- structured normalized payload;
- sensitivity classification and redaction result;
- supporting evidence references;
- normalized content digest; and
- explicit parser warnings or coverage gaps.

Technical identifiers and executable contract values remain canonical. Human-facing candidate summaries require canonical English and a complete Chinese overlay before promotion.

## Persistence Model

### Scanner Release

`ScannerRelease` stores release identity, platform, binary digest, schema compatibility, extractor inventory, signing key ID, signature, status, and release metadata. PostgreSQL is authoritative for release policy; binaries may live in an external artifact store.

### Scan Session

`KnowledgeScanSession` stores the exact Scope, actor, connector, release, contract version, nonce digest, repository policy, limits, state, expiry, latest accepted sequence, and cumulative digest. Session states are `OPEN`, `RECEIVING`, `FINALIZING`, `READY_FOR_ANALYSIS`, `BLOCKED`, `PUBLISHED`, and `EXPIRED`.

### Scan Batch

`KnowledgeScanBatch` is unique by exact Scope, Session, and sequence. It stores the previous digest, payload digest, batch digest, observation count, byte count, status, and acceptance receipt. A duplicate sequence with the same digest is idempotent; a different digest is a conflict.

### Evidence And Observations

SourceObservation remains the normalized deterministic observation record. Large evidence artifacts are referenced by content address and optional one-time upload grants. Full source archives are not stored as design facts.

### Promotion Records

Promotion creates immutable candidate-to-target mappings, DesignAsset revisions, AssetLink revisions, Evidence links, RelationshipOutbox records, and a ChangeSet in one PostgreSQL transaction. Stable candidate, asset, and relationship IDs are Scope-qualified and idempotent.

## MCP Contract

The production workflow uses these exact responsibilities:

- `list_authorized_application_services`: read authorized services.
- `start_knowledge_scan`: create an exact-Scope Session and return policy metadata.
- `get_scanner_release`: return the allowed signed release manifest and artifact reference.
- `get_scan_checkpoint`: return the last accepted sequence and cumulative digest.
- `submit_scan_batch`: validate and persist one ordered idempotent batch.
- `finalize_knowledge_scan`: verify the batch chain, repository snapshot, parser coverage, exclusions, and final manifest.
- `submit_semantic_candidate_batch`: accept Agent-inferred candidates referencing persisted observations.
- `assemble_knowledge_review_bundles`: classify and group candidates by risk, domain cluster, and digest.
- `decide_knowledge_review_bundle`: enforce actor and separation-of-duty policy.
- `promote_knowledge_candidates`: transactionally materialize approved canonical assets and links.
- `publish_knowledge_baseline`: atomically publish only a complete, reconciled ChangeSet.
- `reconcile_knowledge_baseline`: read back Scope, localization, evidence, revisions, relationships, Outbox state, and manifest digest.

All write tools derive Scope from the authenticated Session or exact authorized request context. Caller-provided Scope never overrides persisted authority.

## End-To-End Data Flow

1. The Agent lists authorized services and the user selects one application service.
2. MCP creates a Scope-bound Scan Session and returns the nonce-bearing policy plus approved release metadata.
3. The Agent downloads the release, verifies the pinned trust root, release signature, platform, checksum, compatibility, expiry, and revocation state.
4. The Scanner resolves the repository snapshot, applies static extractors, redacts prohibited content, and emits ordered batches into a local spool.
5. The Agent uploads batches through MCP. Each accepted batch advances a durable checkpoint.
6. Finalization verifies the complete digest chain, immutable snapshot, manifest, coverage, parser inventory, and exclusions.
7. The Agent reads persisted evidence clusters and submits bilingual semantic candidates. Missing meaning becomes unresolved questions.
8. Deterministic policy classifies each candidate into T0-T3 and creates separate ReviewBundles by risk and domain cluster.
9. Authorized actors decide bundles according to separation-of-duty policy.
10. Promotion materializes approved assets, relationships, Evidence links, Outbox rows, and one ChangeSet transactionally.
11. Publication verifies complete coverage, accepted identity mappings, localization, no blocking conflicts, and successful reconciliation before advancing Baseline v1.
12. Read-only reconciliation proves that the visible assets and relationships match the Baseline manifest and exact Scope.

## Review And Promotion Policy

Risk is candidate-level rather than one hard-coded value for the whole scan.

| Tier | Content | Default decision policy |
| --- | --- | --- |
| `T0` | Direct API/schema/event/config facts with deterministic parser evidence | Automatic only when policy allows and no conflict exists |
| `T1` | Low-risk terminology, classification, and ordinary relationships | Independent authorized Agent or human batch approval |
| `T2` | Business rules, state transitions, public contracts, access, retention, and high-impact relationships | Human domain-owner approval |
| `T3` | Ambiguous identity, contradictory evidence, low confidence, prohibited data, or cross-Scope implication | Individual human resolution; batch approval forbidden |

The candidate generator cannot independently approve the same T1 bundle. T2 and T3 cannot be approved by an Agent identity under the default policy. Unchanged candidate digests can inherit a prior decision only when evidence policy, parser version, risk policy, Scope, and semantic digest remain compatible.

Promotion never mutates accepted assets incrementally while review is incomplete. It prepares immutable revisions and commits them with Evidence and relationship events in one ChangeSet transaction. Any failure leaves the previous active Baseline and dashboard counts unchanged.

## Scale And Resource Policy

Default limits are policy-controlled and recorded in the Session:

- at most 500 observations and 4 MiB of canonical JSON per batch;
- at most 8 KiB of redacted evidence excerpt per observation;
- files larger than 10 MiB are skipped unless an extractor-specific policy allows them;
- binary files are excluded and reported;
- the default Session ceiling is 100,000 observations; larger scans require an explicit enterprise policy profile; and
- each batch is committed independently and never holds the whole scan in one PostgreSQL transaction.

Large evidence objects use a pluggable object store with content-addressed references. PostgreSQL stores governance state, normalized facts, digests, mappings, decisions, revisions, and Outbox events. Graph stores remain asynchronous derived projections.

## Failure Handling

- Invalid release signature, checksum, trust root, expiry, revocation, or compatibility blocks scanning.
- Missing or expired exact-Scope authorization blocks Session creation or continuation.
- Duplicate batches with matching digests return the existing receipt; conflicting duplicates block the Session.
- Missing sequence numbers, broken digest chains, altered nonce, or changed repository snapshots block finalization.
- Dirty worktrees are allowed only when policy permits and the complete dirty-snapshot manifest is stable throughout the scan.
- Unsupported parsers, excluded required paths, parser crashes, and budget truncation create visible Coverage Gaps.
- Secret, credential, personal-data, path-traversal, symlink-escape, and malicious-file findings are redacted or blocked according to policy.
- Token expiry pauses uploads without discarding accepted batches. A refreshed token must authorize the same persisted Scope.
- Partial scans, unresolved T3 candidates, missing Chinese overlays, failed promotion, or failed reconciliation cannot publish a Baseline.
- Scanner or MCP failure never changes accepted assets, relationships, the active Baseline, or dashboard counts.

## Security And Privacy

- The release trust key must be configured explicitly; trust-on-first-use is forbidden.
- Scanner release keys and change-attestation keys use separate key IDs and rotation policies.
- The Scanner contains no private signing key and no PostgreSQL credential.
- Repository credentials remain in the Agent's existing environment and are never placed in SpecForge tokens.
- The Scanner does not execute repository code or dynamically load repository content as code.
- Raw secrets, credentials, unrestricted archives, and unredacted sensitive excerpts are never persisted.
- Every release negotiation, Session, batch, finalization, candidate submission, review, promotion, publication, and reconciliation writes an auditable actor, Scope, policy version, and digest.

## Testing Strategy

- Shared Scan Contract fixtures validate identical Go and TypeScript parsing and digest behavior.
- Golden repositories cover Java/Spring, TypeScript/Node, Go, OpenAPI, AsyncAPI, Prisma, SQL, events, state machines, configuration, deployment, tests, and documentation.
- Authorization tests cover multi-service tokens, exact-Scope success, parent denial, sibling denial, Session tampering, and caller Scope overrides.
- Release tests cover valid signatures, wrong keys, rotation overlap, revocation, expiry, checksum mismatch, rollback denial, and incompatible protocols.
- Batch property tests cover ordering, resume, duplicate retry, conflicting duplicate, broken digest chain, limits, and deterministic cumulative digests.
- Security fixtures cover symlink escape, path traversal, huge files, binaries, secret patterns, malicious source text, and prohibited build execution.
- Review tests cover T0-T3 classification, separation of duties, bundle grouping, digest integrity, T2/T3 human gates, and inherited-decision compatibility.
- Promotion tests prove approved candidates become canonical bilingual assets, typed links, Evidence, Outbox rows, and one ChangeSet atomically.
- Publication tests prove partial scans and failed review, promotion, or reconciliation cannot replace the active Baseline.
- End-to-end fixtures use both Claude Code-style and OpenCode-style Agent protocol drivers to scan, review, publish Baseline v1, repeat without duplicates, and read back the exact Scope.
- Scale tests cover the 100,000-observation policy ceiling, bounded batch memory, transaction duration, resume time, and object-store references.

## Delivery Slices

1. **Contract and authority:** versioned JSON Schema, generated Go/TypeScript types, ScannerRelease, Scope-bound Session, batch/checkpoint persistence, and MCP tools.
2. **Standalone Scanner:** Go `scan` command, release verification, local spool, static extractor registry, redaction, coverage, and Golden Fixtures.
3. **Agent semantics and review:** provider-neutral integration pack, semantic candidate batches, candidate-level T0-T3 policy, domain grouping, and separation of duties.
4. **Canonical promotion:** candidate materialization into DesignAsset and AssetLink revisions, Evidence, Outbox, ChangeSet, Baseline v1, and reconciliation.
5. **Production proof:** Claude Code/OpenCode contract fixtures, malicious repository tests, interrupted large-scan recovery, exact-Scope end-to-end evidence, operations documentation, and signed release artifacts.

Each slice updates its repository ADR, Proposal, Context Pack, contracts, relationships, Evidence, and backlog facts. Matching design facts are synchronized and read back through MCP before the slice is claimed complete.

## Acceptance Criteria

- A user can establish Baseline v1 for one authorized application service through Claude Code or OpenCode without deploying scanner infrastructure.
- The Scanner binary and release policy are verified against a pinned enterprise trust root before execution.
- One Token may grant multiple application services, while one Session and every write target exactly one persisted Scope.
- Interrupted scans resume from a durable checkpoint and identical retries do not duplicate observations, candidates, assets, relationships, or review work.
- Real extractors produce traceable API, event, data-model, state, dependency, constraint, test, deployment, and documentation observations with explicit coverage.
- Agent-inferred semantics retain evidence, counter-evidence, confidence, unresolved questions, model metadata, and bilingual content.
- T0-T3 policy and separation of duties are enforced in persistence and integration tests.
- Approved candidates become visible canonical assets and typed relationships only through one MCP-governed promotion transaction.
- Partial or failed runs leave the previous Baseline and dashboard counts unchanged.
- Baseline v1 and its exact Scope, revisions, localization, Evidence, typed links, Outbox events, and manifest are read back successfully.

## Chinese Localization

### 状态

**已于 2026-08-03 批准并完成第一阶段实现。本地阶段验证、精确 Scope MCP 同步/回读、联邦对账和精确设计会话关闭均已通过。第二至第五阶段保持延期。**

- 精确所属应用服务：`com.huawei.celon.desiner`
- 精确 Scope 路径：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 本文档替代 2026-08-01 原始设计中的生产实施边界，但保留原始文档用于追溯
- 继续复用已有扫描基础、MockAI 候选、确定性身份匹配、精确 Scope 治理和 PostgreSQL 权威规则

### 目标与现状

SpecForge 必须让企业用户直接复用 Claude Code、OpenCode 等现有 Coding Agent，为一个存量应用服务建立可信的 Baseline v1。用户不需要部署 Scanner 守护进程，不上传无限制源码压缩包，也不向导入工具提供 PostgreSQL 直连权限。

第一阶段现已具备精确 Scope 鉴权、Design Change Session、预置信任 Ed25519 扫描器发布契约、独立 Go 扫描器、安全工作区遍历、静态证据提取器、可恢复哈希链批次、Provider 无关 Agent 语义候选提交、确定性身份匹配、T0-T3 风险策略、角色分离、原子规范提升、持久对账、不可变 Baseline 发布、发布运维和定向生产验证。

`pnpm legacy-baseline:verify` 已通过契约漂移、Go 测试与构建、155 项 Core 测试、扫描器/知识测试、PostgreSQL 集成、真实签名二进制端到端、10 万条观察规模、类型检查和生产构建。本地 Windows 验证器仅为规避 OneDrive/pnpm 符号链接创建限制而关闭 standalone 追踪复制；Docker/Linux 仍保留 standalone 输出。GitHub 原生发布工作流已配置，但不把远程运行描述为本地已验证证据。

持续观察、实时企业连接器、确定性 3A 投影、CodeHub 门禁、生产对象存储、图投影和完整亿级认证不属于第一阶段。

### 信任架构

SpecForge 发布流水线为各平台构建 `specforge` 单文件程序，并生成 `ScannerReleaseManifest`。清单记录版本、平台、二进制 SHA-256、Scan Contract 版本、静态解析器清单、MCP 兼容范围、构建来源摘要、SBOM 摘要、发布时间、过期策略和撤销状态，并由独立 Ed25519 发布密钥签名。

CLI 或 Agent 必须使用显式配置的企业可信公钥或信任包验签，禁止首次使用时自动信任。密钥轮换通过 Key ID 重叠完成；被撤销的密钥或版本失败关闭；降级使用旧版本必须由服务端策略明确允许。

签名字节采用 UTF-8 RFC 8785 规范 JSON，并排除 `signature` 字段。清单携带 `algorithm=Ed25519`、`keyId` 和 Base64 签名；信任包携带 Base64 编码的 Ed25519 原始 32 字节公钥。Go 与 TypeScript 必须使用同一 Golden Fixture 验证规范字节和签名。

MCP 在校验一个精确应用服务权限后创建 `ScanSession`，并持久化权威 Scope、Actor、Connector、允许的 Release、协议版本、随机 nonce、资源限制、证据策略、解析器策略、过期时间和状态。客户端不能选择或覆盖 `scopePath`；客户端回传的 Scope 只能用于一致性检查。

Scanner 不包含私钥，也不通过“给自己的结果签名”证明可信。每个批次绑定 Session、nonce、Release 摘要、仓库快照摘要、序号、前一批摘要、载荷摘要和协议版本。发布签名证明二进制真实性，Agent 传输鉴权证明调用者身份，批次摘要链证明结果完整性和顺序，三者必须分离。

载荷、批次、累计、清单和仓库快照摘要统一使用规范契约字节的 SHA-256 小写十六进制。nonce 只向获授权 Agent 返回一次，Session 后续仅保存其摘要。

### 组件与契约

Provider 无关 Agent 集成包定义 Claude Code、OpenCode 和兼容 Agent 的共同流程。Agent 负责选择应用服务、创建或恢复 Session、获取并验证 Scanner、执行本地扫描、上传批次、基于证据聚类提交语义候选、展示覆盖与冲突、完成审核、发布和对账。

本增量不需要真实服务端 AI Provider。语义分析由企业已有 Coding Agent 在本地完成，并通过标准候选载荷提交 Agent、模型、Prompt 包版本、证据、置信度、反证和未决问题。MockAIProvider 继续用于开发和契约测试。

`apps/specforge-cli` 增加 `scan` 命令，并保持单文件跨平台程序。Scanner 没有 PostgreSQL 凭据，不直接写设计事实；默认把有界批次写入本地 spool，由 Agent 通过 MCP 运输。Scanner 固定工作区根目录，阻止路径穿越和符号链接逃逸，按策略排除二进制和生成目录，并在输出前完成敏感内容识别与脱敏。

首期只允许签名二进制中静态编译的第一方解析器，不加载仓库插件、动态库、脚本或远程解析器。解析范围包括仓库与构建清单、OpenAPI、AsyncAPI、Prisma/SQL、常见 Java/Spring、TypeScript/Node 和 Go 路由、持久化、事件与状态定义，以及测试、配置、部署描述和 Markdown。每个解析器必须声明 ID、版本、支持范围和限制；不支持或失败必须形成 Coverage Gap。

语言无关 JSON Schema 是唯一 Scan Contract，并生成 Go 与 TypeScript 类型。Observation 必须包含稳定 ID、类型、可确定的架构层和 Aspect、仓库与提交或脏工作区摘要、路径、Symbol、行范围、Parser ID/版本、结构化载荷、敏感级别、脱敏结果、Evidence 引用、规范摘要以及警告或 Coverage Gap。

### 持久化与 MCP

新增或完善 `ScannerRelease`、`KnowledgeScanSession` 和 `KnowledgeScanBatch`。Session 的状态为 `OPEN`、`RECEIVING`、`FINALIZING`、`READY_FOR_ANALYSIS`、`BLOCKED`、`PUBLISHED` 和 `EXPIRED`。Batch 在精确 Scope、Session 和序号上唯一，记录前序摘要、载荷摘要、批次摘要、数量、字节数、状态和接收收据。相同序号与摘要重试幂等，不同摘要冲突并阻塞。

生产 MCP 流程包括：列出授权应用服务、创建扫描、获取 Scanner Release、读取 checkpoint、提交批次、完成扫描、提交语义候选、组装 ReviewBundle、记录审核结论、提升候选、发布 Baseline 和只读对账。所有写操作都从持久化 Session 或精确鉴权上下文派生 Scope。

提升服务必须在一个 PostgreSQL 事务中把批准候选转成正式 DesignAsset 修订、AssetLink 修订、Evidence 链接、RelationshipOutbox 和 ChangeSet。任何失败都不能逐步修改正式资产。Baseline 只能在覆盖完整、身份已接受、中文覆盖完整、无阻塞冲突并且对账成功后发布。

### 审核、规模与失败

风险属于候选本身，不能把整次扫描固定为 T1。T0 是有确定性解析证据的直接技术事实；T1 是低风险术语、分类和普通关系；T2 是业务规则、状态转换、公共契约、权限、保留策略和高影响关系；T3 是身份歧义、证据冲突、低置信度、敏感数据或跨 Scope 影响。T0 仅在策略允许且无冲突时自动提升；T1 需要独立 Agent 或人工审核；T2 需要领域负责人；T3 必须逐项人工解决且禁止批量批准。

默认每批最多 500 个 Observation、4 MiB 规范 JSON，每条 Evidence 摘要最多 8 KiB，超过 10 MiB 的文件默认跳过，默认 Session 上限为 100,000 个 Observation。每批独立提交，不能在一个 PostgreSQL 事务中持有整次扫描。大 Evidence 通过内容寻址对象存储引用，PostgreSQL 保持治理与事实权威，图数据库仅为异步派生投影。

签名、摘要、Trust Root、版本、Scope、nonce、序号链、快照或覆盖校验失败都会阻止完成。Token 过期只暂停上传，不丢弃已接受批次；刷新后的 Token 必须仍授权同一 Scope。部分扫描、未解决 T3、中文缺失、提升失败或对账失败都不能发布 Baseline。任何失败都不得改变既有正式资产、关系、活动 Baseline 或仪表盘数字。

### 测试与交付

测试覆盖共享 Go/TypeScript Schema Fixture、Java/Spring、TypeScript/Node、Go、OpenAPI、AsyncAPI、Prisma、SQL、事件、状态、配置、部署、测试和文档 Golden Repository；覆盖多应用服务 Token、父级和兄弟 Scope 拒绝、签名与密钥轮换、撤销、降级、批次顺序与恢复、恶意仓库、路径穿越、符号链接、超大文件、敏感内容、T0-T3、职责分离、正式资产提升、Baseline 发布和只读对账。

交付分为五个 Slice：一是 Scan Contract、Release、Session、Batch 和 MCP；二是 Go Scanner、静态解析器、脱敏和 Coverage；三是 Agent 语义候选、T0-T3 和职责分离；四是正式 DesignAsset/AssetLink 提升、Outbox、ChangeSet、Baseline 和对账；五是 Claude Code/OpenCode 端到端、恶意仓库、大扫描恢复、运维文档和签名发布产物。

每个 Slice 必须同步更新仓库 ADR、Proposal、Context Pack、契约、关系、Evidence 和待办事实，并在声明完成前通过 MCP 写入和回读。

### 验收标准

用户必须能够通过 Claude Code 或 OpenCode 为一个已授权应用服务建立 Baseline v1，无需部署扫描基础设施。Scanner 必须在执行前通过固定企业 Trust Root 验证。一个 Token 可以授权多个应用服务，但每个 Session 和写操作只能绑定一个持久化 Scope。中断扫描可以从 checkpoint 恢复，重复执行不能生成重复 Observation、Candidate、资产、关系或审核工作。

真实解析器必须生成可追溯的 API、事件、数据模型、状态、依赖、约束、测试、部署和文档 Observation；Agent 语义必须包含证据、反证、置信度、未决问题、模型元数据和双语内容；T0-T3 与职责分离必须由持久化与集成测试强制执行；批准候选只能通过 MCP 提升事务成为正式资产和类型关系。部分或失败执行必须保持旧 Baseline 与仪表盘不变，Baseline v1 的精确 Scope、修订、本地化、Evidence、关系、Outbox 和摘要必须完成回读。
