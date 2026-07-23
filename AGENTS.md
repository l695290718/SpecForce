# SpecForge Design-Fact Governance

## Completion Policy

Every non-trivial change must be classified before implementation is considered complete. Classify architecture boundaries, storage choices, runtime topology, consistency models, security or isolation policies, protocols, compatibility policies, design assets, contracts, rules, state transitions, APIs, events, data models, relationships, user-visible outcomes, agent-facing changes, and deferred or externally blocked work.

For an architectural decision, create or update a repository ADR under `docs/adr/`. For a changed design asset, contract, rule, state transition, API, event, data model, or relationship, update the canonical design record and its typed links. For a user-visible or workflow-level outcome, create or update a Proposal. For an agent-facing change, update or require a linked Context Pack. Deferred, rejected, and externally blocked work must be represented as a tracked backlog fact with an owner, trigger, and rationale.

## Dual Records

The repository ADR is the reviewable engineering record. SpecForge is the queryable operational design record, and MCP is the only system-of-record write boundary for ADRs, Proposals, Context Packs, and typed links. Commit implementation and matching design facts together.

Before completion, synchronously write the matching MCP assets and links, then verify:

- every write uses the exact owning `architectureScope`; implicit or cross-scope writes are forbidden;
- repository and MCP IDs match, and relationship targets are directional, typed, and scope-safe;
- English canonical fields are present and Chinese localized overlays are complete for human-facing decision content;
- evidence references the commands or operational checks that verified the local behavior;
- PostgreSQL remains authoritative for authored assets and relationship events, while graph stores remain derived projections;
- implemented behavior, verified local behavior, and deferred production capability are distinguished.

An implementation is incomplete while either record is missing, inconsistent, pending, or out of scope. If an MCP write cannot be persisted, record **`MCP synchronization blocked`** in the repository record with the failure reason and retry trigger, create or update the corresponding backlog fact, and do not claim completion until synchronization succeeds.

## Federated Governance Increment

For federated design facts, record the governance-core increment independently from connector delivery. Only scoped federation contracts, persistence, MCP authorization, durable audit/outbox behavior, candidate promotion, and read-only reconciliation may be described as implemented after focused evidence. Do not claim legacy scanners, continuous inbound synchronization, outbound proposals, or external `APPLY` until separately designed, evidenced, synchronized, and reconciled through MCP.

## 中文本地化覆盖

### 完成规则

每项非平凡变更都必须在实现前完成分类。架构边界、存储选择、运行时拓扑、一致性模型、安全或隔离策略、协议、兼容性策略，以及设计资产、契约、规则、状态转换、API、事件、数据模型和关系变更，都必须留下可追溯记录。延期、拒绝或外部阻塞的工作必须记录负责人、重试触发条件和原因。

### 双重记录

仓库 ADR 是可审查的工程记录；SpecForge 是可查询的运行设计记录；ADR、Proposal、Context Pack 和有类型关系只能通过 MCP 写入系统记录。所有面向人的决策内容以英文为规范字段，并提供完整的中文本地化覆盖。

用户可见或工作流层面的结果必须创建或更新 Proposal；面向代理的变更必须更新或要求关联的 Context Pack。变更设计资产、契约、规则、状态转换、API、事件、数据模型或关系时，必须更新规范设计记录及其有类型链接。延期、拒绝或外部阻塞的能力必须作为待办事实记录负责人、触发条件和理由。

完成前必须同步写入匹配的 MCP 资产和关系，并核验精确的 `architectureScope`、稳定 ID、英文规范字段、完整中文覆盖和验证证据。关系链接必须有方向、有类型且范围安全；禁止隐式或跨范围写入。PostgreSQL 对已编写资产和关系事件保持权威，图数据库只能作为派生投影。必须明确区分已实现的行为、已在本地验证的行为和延期的生产能力。

Evidence 政策要求为每项变更记录精确命令、操作检查及其结果；失败检查、失败的 MCP 写入、缺失证据或范围不匹配都会阻止完成。MCP 写入失败时，必须记录 **`MCP synchronization blocked`**、失败原因和重试触发条件，登记待办事实，并在同步成功和核验完成前禁止声明完成。

## 联邦治理增量

对于联邦设计事实，必须将治理核心增量与连接器交付分开记录。只有精确 Scope 下的联邦契约、持久化、MCP 授权、持久审计/Outbox 行为、候选事实提升和只读对账，在具备针对性证据后才能描述为已实现。存量扫描器、持续入站同步、出站 Proposal 和外部 `APPLY` 必须在完成独立设计、取证、MCP 同步和对账前保持未声明状态。

## Evidence

Focused tests and operational checks are required for each change. Put the exact commands and their results in the relevant ADR or design record. A failed check, failed MCP write, missing evidence, or scope mismatch blocks completion.
