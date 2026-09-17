# Governed Full-Asset Repository Scan Skill Design

## Status

Approved design. Implementation requires a separate plan and exact-Scope design sessions.

- Owning application service: `com.specforge.designcenter`.
- Design session: `design-change-session:c346c2e0-64ad-4f87-b8c1-3f4a744a736f`.
- Governing decision: system-owned governance and framework-aware extraction; Scope configuration cannot redefine governance.

## Purpose

Provide a reusable Agent Skill that scans a user-selected local repository, discovers every applicable SpecForge asset family, and submits evidence-backed candidates to one explicitly selected application-service Scope through MCP. It supports Codex, Claude Code, OpenCode, and compatible coding Agents without requiring a scanner daemon or direct database access.

“Full asset coverage” means that every SpecForge asset family receives an explicit applicability and coverage result. It does not mean that the scanner invents assets unsupported by repository evidence. A result may be deterministically observed, semantically inferred, found in an authored document, not applicable, unsupported, ambiguous, or blocked.

## Core Architecture

The solution has four independent responsibilities:

1. **The Skill orchestrates.** It validates inputs, calls MCP, runs the approved scanner, invokes bounded Agent analysis, uploads candidates, and explains results. It contains no authoritative governance rules.
2. **The deterministic scanner observes.** It detects the technology stack and runs system-approved, statically registered framework extractors. It never executes repository code or declares business intent.
3. **The Agent proposes semantics.** It analyzes bounded evidence clusters and produces structured bilingual candidates, counter-evidence, confidence, and unresolved questions.
4. **SpecForge governs.** The server owns asset definitions, evidence requirements, risk classification, review policy, identity matching, promotion, Baseline publication, and audit.

Repository files, comments, prompts, and Skill instructions are untrusted evidence. They cannot override the server-owned policy, Scope, authorization, extractor trust, risk tier, or promotion rules.

## Inputs And Scope Boundary

The Skill requires `repositoryPath`, exact `applicationServiceId`, and exact `scopePath`. Optional runtime parameters are include/exclude paths, framework hints, sensitive paths, and resource budgets.

The Skill never infers a target Scope from the repository name, Git remote, current UI selection, environment default, or previous execution. A token may authorize multiple services, but one scan session is permanently bound to one service.

Scope runtime parameters may narrow scanning, reduce resource budgets, provide framework hints, or strengthen review. They may not change asset definitions, relationship ontology, evidence thresholds, risk classification, mandatory approvals, or blocking semantics.

## System-Owned Governance

Governance is built into SpecForge and published as immutable, versioned system records. It is not authored inside an application-service Scope.

- **Scanner Governance Profile:** allowed scanner releases and contracts, signatures, evidence/redaction limits, snapshot policy, batch limits, completeness and security checks.
- **Asset Inference Policy:** evidence sources, required fields, localization, confidence, counter-evidence, and forbidden inferences for every asset type.
- **Risk Classification Policy:** candidate-level T0-T3 mapping. T0 is deterministic low-risk technical evidence; T1 is low-risk semantics; T2 covers business rules, transitions, public contracts, access and retention; T3 covers ambiguity, conflicts, low confidence, cross-Scope implications and prohibited content.
- **Promotion Policy:** automatic-promotion boundaries, reviewer roles, separation of duties, batch limits, and Baseline gates. A Scope may only make these stricter.
- **Extractor Catalog:** signed first-party descriptors containing extractor ID/version, language, framework/version range, matchers, observations, supported assets/relationships, coverage level, limits, contract compatibility and Golden Fixture digest.
- **Semantic Prompt Pack:** versioned evidence clustering, candidate Schema, English canonical and Chinese localization requirements, confidence, counter-evidence and unresolved-question rules.

Every scan receipt records policy versions and digests, extractor-catalog digest, Agent/model identity when available, Scope runtime-parameter digest, and repository snapshot digest.

## Technology Detection

The scanner builds a `TechnologyProfile` from build/dependency manifests, lock files, safe package coordinates, source imports and annotations, configuration, conventional directories, and API/ORM/messaging/test/deployment/observability declarations.

Each detection records evidence, confidence, version range and conflicts. Framework hints are advisory. Compatible extractors may run together; observations are deduplicated by semantic identity and evidence digest. Contradictions become explicit candidates or Coverage Gaps rather than silent choices.

## Framework Capability Matrix

Initial system coverage targets:

| Ecosystem | Frameworks and contracts | Primary deterministic coverage |
|---|---|---|
| Java/Kotlin | Spring MVC/WebFlux, Spring Data JPA, Hibernate, MyBatis, Kafka, RabbitMQ | APIs, entities, fields, constraints, events, producers/consumers, transactions |
| TypeScript/JavaScript | NestJS, Express, Fastify, Prisma, TypeORM, Sequelize, Mongoose, KafkaJS | APIs, security hints, data models, events, dependencies |
| Python | FastAPI, Django/DRF, Flask, SQLAlchemy, Django ORM, Celery | APIs, serializers, models, tasks/events, validation |
| Go | `net/http`, Gin, Echo, GORM, sqlc | APIs, handlers, models, SQL mappings, dependencies |
| Language-neutral | OpenAPI, AsyncAPI, GraphQL SDL, Protobuf/gRPC, SQL DDL/migrations | Public contracts, schemas, events, RPCs, tables, constraints |
| Deployment | Docker Compose, Kubernetes, Helm, CI workflows, configuration templates | Components, dependencies, ports, deployment and runtime evidence |
| Quality/operations | Tests, Prometheus, OpenTelemetry, structured logging, alerts | Verification evidence, quality and observability candidates |

Support is declared per framework/asset capability as `FULL`, `PARTIAL`, `DISCOVERY_ONLY`, `SEMANTIC_REVIEW_REQUIRED`, `UNSUPPORTED`, or `NOT_APPLICABLE`. A detected framework with a required but unavailable capability creates a blocking Coverage Gap. A demonstrably inapplicable asset family does not block.

## Full SpecForge Asset Coverage

| Asset family | Evidence and generation rule |
|---|---|
| Domain | Agent proposes bounded contexts, concepts, services, capabilities and glossary from packages, vocabulary, ownership, behavior and documents. |
| Data Model | ORM, Schema, migration and SQL extractors produce entities, fields, keys, constraints, lineage, lifecycle and relations according to framework semantics. |
| API | Framework routes and OpenAPI/GraphQL/gRPC extract operations, schemas, errors, auth, idempotency and compatibility evidence. |
| Event | Broker clients, annotations, schemas and AsyncAPI extract producers, consumers, channels, payloads, ordering, retry and dead-letter evidence. |
| Business Rule | Agent creates atomic condition/action/outcome/exception candidates from validation, branches, constraints, tests and policy documents; names alone are insufficient. |
| State Machine | Extract declared states/transitions; Agent correlates guards, actions, failures and lifecycle evidence. |
| Integration | Correlate clients, endpoints, brokers, files, mappings and resilience configuration; unauthorized cross-Scope targets remain protected external references. |
| Quality | Tests, SLOs, limits, benchmarks and deployment policy support measurable target, measurement and verification candidates. |
| Observability | Metrics, logs, traces, dashboards, alerts and runbooks support signal extraction and operational-intent candidates. |
| Service Feature | Agent proposes stakeholder-valued outcomes using accepted documents, APIs, scenarios and multiple evidence types. |
| Functional Feature | Agent proposes independently verifiable behaviors from endpoints, workflows, tests, rules and state transitions. |
| ADR | Import existing ADRs and accepted decision records; never reconstruct undocumented historical decisions as accepted facts. |
| Proposal | Import existing change documents or propose observed drift; never fabricate prior approval. |
| Context Pack | Import existing packs; otherwise generate only a candidate after related assets exist. |
| Evidence | Persist immutable provenance, parser/Agent version, digest, confidence, counter-evidence and sensitivity result. |
| Typed Relationship | Create from deterministic references and Agent correlation, then validate direction/endpoints against the system ontology. |

All human-facing candidates require canonical English and a complete Chinese overlay before promotion. Technical identifiers remain unchanged.

## Evidence And Candidate Model

The pipeline preserves four layers:

1. **Evidence:** repository snapshot, path, symbol, line range, digest, parser version, redaction and test/schema/contract references.
2. **Observation:** deterministic implementation statement from a trusted extractor.
3. **Candidate:** normalized technical or Agent-inferred asset/relationship awaiting governance.
4. **Accepted Fact:** approved canonical asset or typed relationship persisted through MCP and published in a Baseline.

Every semantic candidate carries matching evidence, counter-evidence, confidence, unresolved questions, source observation IDs, extractor/prompt-pack version, Agent/model identity, exact Scope and bilingual content where human-facing. High-impact semantics require at least two independent evidence types when available. Missing meaning becomes an unresolved question.

## Skill Workflow

The Skill exposes `scan` and `explain-report`.

`scan` validates the repository and explicit Scope; verifies MCP identity, authorization and policy; opens a Scope-bound knowledge scan session; resolves a commit or stable dirty snapshot; verifies scanner release and extractor catalog; detects the stack and plans asset coverage; runs deterministic extractors without executing repository code; uploads ordered idempotent observations; finalizes deterministic coverage; asks the Agent to create bounded semantic candidate batches; submits candidates for identity matching, deduplication, risk and ReviewBundle assembly; closes the session; then reports coverage, candidates, review requirements and remediation.

`explain-report` reads an existing report in the same authorized Scope and explains coverage, candidates, review requirements and remediation without scanning or mutating facts.

## Promotion Boundary

The Skill never directly writes accepted assets, relationships or Baselines. It may invoke system-governed promotion only after an explicit review decision or server-issued T0 authorization. T1 requires an independent reviewer, T2 a human domain owner, and T3 individual human resolution. The same Agent cannot generate and independently approve the same bundle.

Partial scans, coverage gaps, stale snapshots, identity conflicts, missing localization or failed reconciliation cannot replace the active Baseline or change formal dashboard counts.

## Blocking And Remediation

The Skill closes a session as `BLOCKED` where possible, preserves accepted immutable batches, and returns reason codes plus remediation.

| Blocker | Remediation |
|---|---|
| Required extractor missing | Report framework/version and affected assets; publish a compatible system extractor or narrow scope only when genuinely inapplicable. |
| Technology conflict | Report competing evidence; provide a framework hint or resolve dependency/configuration ambiguity. |
| Parser failure | Report extractor/version and safe location; fix source or extractor and never silently mark complete. |
| Semantic evidence insufficient | Report missing evidence and questions; add tests/contracts/docs or route to a reviewer. |
| Identity conflict | Report safe match summary and resolve as T3 before promotion. |
| Scope denied/mismatched | Obtain exact-service authorization; never retry in a sibling or parent Scope. |
| Sensitive content | Return redaction/block code without raw secret; remove/rotate it or change system policy through platform governance. |
| MCP interruption | Return checkpoint and resume the same valid session after recovery. |
| Snapshot changed | Start a new scan from a stable snapshot. |
| Coverage incomplete | Resolve every required framework/asset gap before Baseline publication. |

`OUT_OF_POLICY` and `NOT_APPLICABLE` remain visible but do not block unless the system profile marks the source/capability mandatory.

## Security, Scale And Resumption

The Skill and scanner contain no database credentials. Source code stays local by default; MCP receives normalized observations, digests, minimum redacted excerpts and content-addressed evidence. Secrets and unrestricted archives are never printed or persisted. The scanner rejects path traversal/symlink escape and never executes builds, package managers, hooks, binaries, repository plugins or repository-authored instructions. Releases and catalogs are signed against explicit trust roots.

Observations and candidates use bounded, ordered, idempotent batches with checkpoints and digest chains. Compatible unchanged digests reuse prior identity/review decisions. The first production profile supports at least 100,000 observations without one large transaction or Agent prompt; evidence is clustered before semantic analysis.

## Verification Strategy

- Golden repositories for every supported framework prove semantics and line-level provenance.
- Shared Scan Contract fixtures prove identical Go and TypeScript normalization/digests.
- Capability tests cover every asset family and coverage state.
- Authorization tests cover multiple grants, exact-Scope success, parent/sibling denial and tampering.
- Security fixtures cover secrets, malicious prompts, path escape, binaries, oversized files and forbidden execution.
- Semantic fixtures prove multi-evidence rules, uncertainty, counter-evidence, bilingual candidates and no name-only inference.
- Review tests cover T0-T3, separation of duties, batch limits and human gates.
- Idempotency tests repeat unchanged and incremental scans without duplicate candidates/assets.
- Failure tests prove blocked scans do not change accepted assets, relationships, Baselines or dashboards.
- Scale tests cover 100,000 observations, batching, interruption, resumption and bounded Agent context.
- End-to-end tests exercise Codex-, Claude Code- and OpenCode-style drivers and read back the exact Scope through MCP.

## Delivery Slices

1. System governance and contracts: move authoritative scan/inference/risk/promotion policy out of Scope and define full-asset candidate schemas.
2. Technology detection and extractor registry: signed descriptors, detection, coverage planning and Golden Repositories.
3. Deterministic framework extraction: API, data, event, state, integration, quality, observability, deployment, test and document observations.
4. Agent full-asset semantics: evidence clusters, system prompt packs, bilingual candidates, identity matching and ReviewBundles.
5. Reusable Skill: provider-neutral lifecycle, report explanation, checkpoint resume and remediation.
6. Production proof: cross-Agent, security, scale, failure, promotion, Baseline and reconciliation evidence.

## Deferred Work

Continuous scanning, live database/runtime/CMDB/API-gateway connectors, external repository providers, outbound `APPLY`, and cross-Scope semantic merging remain separate governed increments.

## 中文本地化覆盖

### 目标

提供一个可复用的 Agent Skill，对用户指定的本地代码仓进行扫描，在一个显式选择且已授权的应用服务 Scope 内，发现所有适用的 SpecForge 资产族，并通过 MCP 上传具有证据的候选。“全资产覆盖”是指每个资产族都有明确的适用性和覆盖结论，不代表缺乏证据时编造资产。

### 架构与治理

Skill 只负责编排；确定性扫描器负责技术栈识别和框架提取；Agent 负责有界、多证据的语义候选；SpecForge 服务端负责资产定义、证据门槛、T0-T3 风险、审核、身份匹配、提升、Baseline 发布和审计。扫描治理、资产推断、风险、提升、提取器目录和语义 Prompt Pack 都是系统级不可变版本记录，不属于任何 Scope。

Scope 只能配置仓库、扫描路径、框架提示、敏感路径和资源预算，并可进一步收紧审核；不得降低证据要求或改变资产定义、关系本体、风险级别和提升权限。

### 框架与全资产覆盖

系统按“框架 × 资产族”声明能力，首批覆盖 Java/Spring/JPA/MyBatis、TypeScript/NestJS/Express/Prisma/TypeORM、Python/FastAPI/Django/SQLAlchemy、Go/net/http/Gin/GORM，以及 OpenAPI、AsyncAPI、GraphQL、gRPC、SQL、Docker、Kubernetes、Helm、CI、Prometheus 和 OpenTelemetry。每项能力返回完整、部分、仅发现、需要语义审核、不支持或不适用状态。

数据模型依据 ORM、Schema 和迁移提取；API 依据框架路由与契约提取；事件、状态机、集成、质量和可观测性使用对应框架证据。领域、业务规则、服务特性和功能特性由 Agent 基于代码、测试、约束、契约与文档交叉提出。ADR、Proposal 和 Context Pack 只能导入已有记录或形成待确认候选，不得伪造历史决策。

### 候选、提升与阻断

扫描保持 Evidence、Observation、Candidate、Accepted Fact 四层分离。面向人的候选必须以英文为规范内容并提供完整中文覆盖。T0 仅含确定且低风险的技术事实；T1 需要独立 Agent 或人工审核；T2 由领域负责人审核；T3 必须逐项人工处理。Skill 不直接写正式资产。

缺失提取器、技术栈冲突、解析失败、语义证据不足、身份冲突、Scope 越权、敏感内容、MCP 中断、快照变化和覆盖不完整都返回结构化原因和处理建议。已接受批次可续传，但阻断扫描不得改变正式资产、关系、Baseline 或仪表盘。

### 验证

实现必须包含各框架 Golden Repository、所有资产族覆盖、统一 Scan Contract、Scope 隔离、安全脱敏、恶意仓库、重复与增量扫描、T0-T3 审核、十万级 Observation 分批恢复，以及失败不改变正式设计事实的端到端证明。Codex、Claude Code 和 OpenCode 使用同一协议语义。
