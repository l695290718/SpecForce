# Agent-Driven Legacy Baseline Discovery

## Status

**Superseded for production implementation by `2026-08-03-agent-driven-legacy-baseline-production-design.md`. Retained as the original approved discovery concept for traceability.**

- Owning `architectureScope.applicationServiceId`: `com.huawei.celon.desiner`
- Owning `architectureScope.scopePath`: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Delivery increment: manually initiated baseline discovery through an existing coding Agent
- Deferred: continuous CI synchronization, live runtime connectors, outbound proposals, and external `APPLY`

## Purpose

Enterprise users already operate legacy application services and commonly have coding Agents such as Claude Code or OpenCode available inside the source workspace. SpecForge must let those users establish a trustworthy design baseline without deploying a scanner daemon or granting an ungoverned importer direct database access.

The baseline must distinguish observable implementation structure from inferred business meaning. Deterministic tooling builds a reproducible evidence index; an Agent derives semantic candidates from selected evidence; authorization and review policy determine which candidates become accepted design facts.

## Scope and Authorization

The enterprise hierarchy of product family, product, sub-product, module, and application service is maintained before discovery begins. Discovery cannot create, rename, move, or delete hierarchy records.

A bearer token may grant access to multiple application services. Every operation still targets exactly one application-service Scope:

- the caller explicitly selects one `applicationServiceId`;
- the server resolves the corresponding stored `scopePath` and verifies an exact token grant;
- a Scan Session is permanently bound to that resolved Scope;
- the server stamps the Scope onto every observation, candidate, review bundle, accepted fact, relationship, and audit record;
- caller payloads cannot override the bound Scope;
- parent hierarchy access does not imply descendant write access;
- no front-end selection, default workspace, or request-local fallback is an authorization source.

Cross-service dependencies discovered without target-Scope authority remain unresolved external-reference candidates. They cannot create formal cross-Scope relationships.

## Architecture

### Remote MCP control plane

The enterprise SpecForge deployment exposes an authenticated remote MCP endpoint for Claude Code, OpenCode, and compatible Agents. MCP is the control and governance plane. It lists authorized application services, opens Scan Sessions, negotiates scanner versions, accepts bounded observation batches, reports coverage, creates review bundles, promotes candidates, and reconciles the resulting baseline.

Accepted authored facts, ADRs, Proposals, Context Packs, Evidence, and typed links cross the MCP write boundary. PostgreSQL remains authoritative. Graph storage remains a derived projection.

### Agent integration pack

A provider-neutral integration pack teaches supported Agents how to:

1. request the user's authorized application services;
2. select one exact Scope;
3. start or resume a Scan Session;
4. obtain and verify the approved scanner package;
5. run deterministic extraction in the current workspace;
6. inspect the evidence index and derive semantic candidates;
7. present coverage, conflicts, and review bundles;
8. invoke MCP promotion and reconciliation tools.

The integration pack must not depend on one model vendor's private extension API. Provider-specific wrappers may improve installation, but they must preserve the common protocol and result schema.

### Ephemeral deterministic scanner

The scanner is a versioned, signed, cross-platform CLI invoked by the Agent for a single Scan Session. It is not a daemon, Docker service, or persistent worker. It does not require users to deploy infrastructure.

The scanner extracts reproducible implementation evidence, including repository and build structure, API routes and OpenAPI contracts, ORM entities and migrations, database constraints, event publication and consumption, module dependencies, state definitions, tests, configuration, deployment descriptors, and local documentation.

The scanner does not declare business intent. It emits a content-addressed evidence index with repository identity, commit, path, line, parser version, normalized digest, structural observations, exclusions, and parser coverage.

The scanner must not execute repository build scripts by default. Optional execution requires explicit user approval and a declared policy.

### Agent semantic extraction

The Agent queries the evidence index instead of reading the entire repository without structure. It clusters related observations and proposes bounded contexts, business capabilities, ubiquitous language, concepts, lifecycles, invariants, workflows, policies, and atomic business rules.

Every semantic candidate includes:

- English canonical content and a complete Chinese overlay before promotion;
- exact application-service Scope;
- confidence and classification;
- supporting evidence references and any counter-evidence;
- unresolved questions;
- source commit and evidence digest;
- Agent/model identity and version when available;
- extraction prompt or integration-pack version.

Names alone are leads, not proof. High-confidence rules require concrete evidence from code, tests, schemas, contracts, or runtime artifacts. Important rules should use two evidence types when available. Missing intent becomes an explicit question rather than invented semantics.

## Fact Layers

Discovery uses four distinct layers:

1. **Evidence** is immutable source traceability such as commit, file, line, schema object, test, and digest.
2. **Observation** is a deterministic implementation statement produced by the scanner.
3. **Candidate** is a normalized technical fact or Agent-inferred semantic fact awaiting policy evaluation.
4. **Accepted Fact** is a governed SpecForge design asset or typed relationship published through MCP.

Failed or partial discovery cannot mutate accepted facts. A new baseline becomes visible atomically after its required Scan Sessions, review bundles, localization, evidence, and reconciliation gates pass.

## Review at Enterprise Scale

Raw observations are deduplicated, identity-matched, clustered, and summarized before review. Review operates on domain-oriented `ReviewBundle` records rather than forcing one approval click per candidate.

Each bundle records its candidate digest, evidence coverage, risk distribution, conflicts, unresolved questions, reviewer identity, review policy version, sample set, and decision. Approval of a bundle produces an auditable decision for every included candidate.

Candidates use four policy tiers:

| Tier | Content | Default handling |
| --- | --- | --- |
| `T0_TECHNICAL` | Directly observed API signatures, schema fields, constraints, event shapes | Policy-controlled automatic promotion |
| `T1_LOW_RISK_SEMANTIC` | Terms, capability classification, ordinary entity relationships | Independent authorized Agent may batch-review and approve |
| `T2_HIGH_IMPACT_SEMANTIC` | Business rules, state transitions, public contracts, access or retention policy | Human domain-owner approval |
| `T3_UNCERTAIN_OR_CONFLICTED` | Contradictory evidence, low confidence, unresolved identity, cross-Scope implication | Individual human resolution; batch promotion forbidden |

Permissions remain distinct: `semantic:propose`, `semantic:review`, and `semantic:approve`. The same Agent identity must not generate and independently approve the same T1 bundle. T2 and T3 require a human actor by default.

Repeated scans review only semantic or evidence changes. Unchanged candidate digests inherit the previous decision. Evidence relocation without a semantic digest change does not force a full re-review. Quality metrics track sampled accuracy and false acceptance by scanner, model, and prompt version; policy can increase sampling or suspend batch approval when quality degrades.

## Data Flow

1. The Agent lists token-authorized application services through MCP.
2. The user selects one application service.
3. MCP creates an exact-Scope Scan Session and returns scanner policy and version metadata.
4. The Agent obtains and verifies the signed scanner package.
5. The scanner indexes the current workspace at an immutable commit or records an explicit dirty-worktree snapshot digest.
6. The scanner submits idempotent observation batches and a coverage manifest.
7. The server validates the session, batch sequence, digests, schema version, and bound Scope.
8. Identity matching and deduplication produce technical candidates and evidence clusters.
9. The Agent derives semantic candidates from relevant clusters and submits them through MCP.
10. SpecForge creates risk-tiered Review Bundles.
11. Policy, an independent authorized Agent, or a human domain owner records decisions according to tier.
12. MCP promotes approved candidates, writes evidence and typed links, and emits transactional Outbox records.
13. Baseline publication verifies completeness and atomically advances the active baseline.
14. Read-only reconciliation proves the accepted baseline matches its evidence, localization, relationships, and Scope.

## Payload and Scale Policy

Full source code is not uploaded by default. The server receives normalized observations, content digests, coverage metadata, and the minimum redacted evidence excerpts required for review. Repository URI, commit, path, and line remain the primary source reference.

Observation submission is chunked and idempotent. Large optional evidence artifacts use a pluggable content store and one-time upload grants negotiated through MCP; they are not embedded in one MCP response. Formal promotion remains an MCP-governed operation regardless of evidence transport.

Function-level and statement-level evidence does not automatically become a design-graph node. PostgreSQL stores governed assets, candidates, mappings, audit state, and relationship events. The graph projection contains only relationships needed for governed navigation and impact analysis.

## Failure Handling

- Missing exact-Scope authorization rejects session creation.
- Scope overrides or cross-Scope batches fail closed and are audited.
- Interrupted sessions resume from durable batch checkpoints.
- Duplicate batches are idempotent by session, sequence, and digest.
- Unsupported parsers or excluded paths create visible coverage gaps.
- A changed commit or snapshot digest marks the result stale and blocks publication.
- Partial scans never replace the previous active baseline.
- Secret or personal-data findings are redacted; prohibited payloads are not uploaded.
- Ambiguous identities and contradictory evidence create T3 conflicts.
- Token expiry pauses the operation without losing accepted batches; a refreshed token must still authorize the same Scope.
- Failed discovery leaves accepted assets and dashboard counts unchanged.

## Initial Delivery

The first implementation supports manually initiated baseline discovery from Claude Code and OpenCode in a local source workspace. It includes remote authenticated MCP control, multi-service token grants with one-Scope-per-operation enforcement, the provider-neutral integration pack, the ephemeral scanner contract, deterministic evidence indexing, Agent semantic candidate submission, four-tier Review Bundles, atomic baseline publication, and read-only reconciliation.

The first scanner targets repository structure, common build manifests, OpenAPI, source-defined routes, ORM models, database migrations, events, state definitions, tests, configuration, deployment descriptors, and Markdown documentation. Language and framework support must be declared by version; unsupported areas remain visible coverage gaps.

Continuous CI observation, live database introspection, API gateway or CMDB connectors, runtime traces, outbound patches, and external `APPLY` are separate increments.

## Security

- SpecForge tokens authorize SpecForge operations only and never contain source-system credentials.
- A token may grant multiple application services, but every operation is exact-Scope.
- Source credentials use an enterprise secret provider or the Agent's existing authenticated environment.
- Scanner packages require signature and checksum verification.
- Local analysis is preferred; source excerpts sent to an Agent or model follow enterprise provider policy.
- Raw secrets, credentials, and unrestricted source archives are never persisted as design facts.
- Every scan, review, promotion, rejection, and publication records actor, Scope, policy version, and digest.

## Testing Strategy

- Authorization tests cover multi-service tokens, exact-Scope success, parent-only denial, sibling denial, and payload Scope tampering.
- Golden fixtures prove deterministic extraction and digest stability across repeated scans.
- Contract tests run the same workflow through Claude Code and OpenCode integration fixtures.
- Property tests cover batch idempotency, ordering, resume, and stable identity mapping.
- Security tests cover secret redaction, malicious repository content, package verification, and forbidden build execution.
- Semantic fixtures verify evidence-backed rules, explicit uncertainty, counter-evidence, and no inference from names alone.
- Review tests cover separation of duties, tier policy, bundle digest integrity, batch approval, and T2/T3 human gates.
- Publication tests prove partial scans and failed reviews cannot replace the active baseline.
- End-to-end tests scan a fixture legacy service, review one bundle, publish Baseline v1, repeat the scan without duplicates, and reconcile the exact Scope.

## Acceptance Criteria

- A user with Claude Code or OpenCode can establish a baseline without deploying scanner infrastructure.
- One token may grant multiple application services; one operation and Scan Session target exactly one service.
- Deterministic observations and Agent-inferred semantics remain distinguishable and traceable.
- Repeated scans of the same snapshot do not create duplicate assets or review work.
- T0 through T3 policies enforce the configured automation and human-review boundaries.
- Review Bundles make large candidate sets governable without losing per-fact auditability.
- Coverage gaps, uncertainty, conflicts, and unsupported parsers are visible and block unsafe publication.
- Formal assets, relationships, localization, evidence, and baseline publication are persisted through MCP and verified by read-only reconciliation.

## Chinese Localization

### 状态

本原始设计已被 `2026-08-03-agent-driven-legacy-baseline-production-design.md` 的生产实施设计取代，并保留用于追溯。新版设计继续采用 Claude Code、OpenCode 等现有 Coding Agent 在项目目录中主动发起存量基线扫描；持续 CI 同步、运行时连接器、出站提案和外部 `APPLY` 仍保持延期。

### 目标与边界

企业预先维护产品族、产品、子产品、模块和应用服务层级。扫描不能创建、改名、移动或删除这些层级。一个 Token 可以授权多个应用服务，但每次操作只能显式绑定一个应用服务 Scope。服务端从已维护数据中解析 `scopePath`，逐次校验精确授权，并为扫描会话、观察、候选、审核包、正式事实、关系和审计记录写入不可覆盖的 Scope。

### 架构决策

采用“远程 MCP 控制面 + Agent 集成包 + 临时确定性扫描工具 + Agent 语义提取 + 分级 ReviewBundle”的方案。用户无需部署 Scanner、Worker 或额外 Docker 服务。固定工具只负责建立可重复的实现证据索引，不声明业务意图；Agent 基于证据聚类提取领域语义、业务规则、状态生命周期和业务关系。缺失语义必须成为明确问题，不得由模型编造。

正式设计事实、ADR、Proposal、Context Pack、Evidence 和类型化关系必须通过 MCP 写入。PostgreSQL 保持权威，图数据库仅为派生投影。默认不上传完整源码，只提交结构化观察、摘要、覆盖信息和最小脱敏证据。

### 规模化审核

原始观察先进行去重、身份匹配、业务聚类和规则归纳，再形成按领域组织的 ReviewBundle。T0 技术事实可按策略自动提升；T1 低风险语义可由独立且获授权的 Agent 批量审核；T2 高影响业务语义默认由领域负责人确认；T3 不确定、冲突或跨 Scope 候选必须逐项人工处理。生成候选和独立批准同一 T1 审核包不能使用同一个 Agent 身份。

重复扫描只审核变化后的语义或证据摘要。未变化事实继承历史决策。系统持续统计抽样准确率和误确认率，并可在质量下降时提高抽样比例或暂停批量批准。

### 失败与安全

越权 Scope、篡改 Scope、摘要不一致、解析器不兼容、扫描期间版本变化和部分扫描都必须阻止基线发布。中断扫描可从批次检查点恢复，重复批次保持幂等。跨服务依赖在缺少目标权限时只能保留为外部引用候选。扫描失败不得改变已有正式资产或仪表盘数据。

Token 只授权 SpecForge 操作，不携带 Git、数据库或其他源系统凭据。扫描工具必须校验签名和摘要，默认不执行项目构建脚本，并对密钥和个人数据进行阻断或脱敏。

### 首期验收

用户可以通过 Claude Code 或 OpenCode 对单个有权限的应用服务建立 Baseline v1，无需部署扫描基础设施。同一快照重复扫描不会生成重复资产；技术事实、推断语义和正式事实保持分层；大规模候选可以通过 ReviewBundle 审核；所有正式记录具有精确 Scope、双语内容、证据和 MCP 对账结果。
