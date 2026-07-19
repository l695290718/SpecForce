# Architecture Decision Records

## Purpose

Repository ADRs are the reviewable engineering record for architectural decisions. Each decision must also have a matching MCP record in the exact owning `architectureScope`; repository documentation does not replace MCP synchronization.

## Filename Contract

ADR filenames must use the form `NNNN-kebab-case.md`, where `NNNN` is a four-digit, zero-padded sequence number. The filename is stable once published. Renaming an ADR requires an explicit decision and updated repository references.

## Required Sections

Every ADR must contain these sections, in this order unless a stronger local template applies:

1. `Status`
2. `Context`
3. `Decision`
4. `Alternatives`
5. `Consequences`
6. `Constraints`
7. `Evidence`
8. `MCP Record`

The ADR must state its stable ID, exact owning `architectureScope`, related assets or records, and implementation status. `Context`, `Decision`, and the title are English canonical fields. Human-facing decision content must include complete Chinese localized overlays. `Alternatives` must identify rejected options and why they were rejected. `Consequences` must include material tradeoffs. `Constraints` must include scope, authority, isolation, and compatibility requirements where applicable. `Evidence` must list the commands or operational checks and their results.

## MCP Record

The `MCP Record` section must contain the matching MCP ADR ID, which is the same stable ID as the repository ADR, and the exact owning `architectureScope`. It must identify matching Proposals, Context Packs, related assets, typed links, and evidence references when those records exist.

MCP is the only system-of-record write path. Verify the returned IDs, exact scope, English canonical fields, Chinese overlays, relationship targets, and evidence after each write. PostgreSQL is authoritative for authored assets and relationship events; graph stores are derived projections.

If synchronization fails, record **`MCP synchronization blocked`**, the failure reason, and a retry trigger in this ADR and create or update the tracked backlog fact. The ADR and the implementation are incomplete until the MCP record and required links are persisted and verified.

## Federated Governance Facts

Federated governance-core decisions must name the delivered increment separately from future connector delivery. Contract, scope, audit, durable delivery, candidate, authority, and read-only reconciliation facts may be recorded as implemented only when their focused evidence is present. Legacy discovery scanners, continuous inbound connectors, outbound proposals, and external `APPLY` remain deferred until their own scoped ADR, Proposal, Context Pack, evidence, and MCP reconciliation records exist.

## 中文本地化覆盖

### 用途

仓库 ADR 是架构决策的可审查工程记录。每项决策还必须在其精确的 `architectureScope` 中拥有匹配的 MCP 记录；仓库文档不能替代 MCP 同步。

### 文件名和章节

文件名必须符合 `NNNN-kebab-case.md`，其中 `NNNN` 是四位、补零的序号；发布后文件名必须稳定。ADR 重命名必须有明确决策，并更新仓库中的所有引用。每份 ADR 必须按顺序（除非更强的本地模板另有规定）包含 `Status`、`Context`、`Decision`、`Alternatives`、`Consequences`、`Constraints`、`Evidence` 和 `MCP Record` 章节。标题、背景和决策以英文为规范字段，并为面向人的决策内容提供完整中文覆盖。

ADR 必须写明稳定 ID、精确的所属 `architectureScope`、相关资产或记录以及实现状态。`Alternatives` 必须说明被拒绝的选项及原因；`Consequences` 必须包含实质性权衡；`Constraints` 必须在适用时包含范围、权威性、隔离和兼容性要求；`Evidence` 必须列出精确命令或操作检查及其结果。

### MCP 记录与失败处理

`MCP Record` 必须包含与仓库 ADR 相同的稳定 MCP ADR ID 和精确的所属范围，并列出匹配的 Proposal、Context Pack、资产关系和证据。MCP 是唯一的系统记录写入路径；每次写入后必须核验返回的 ID、精确范围、英文规范字段、中文覆盖、关系目标和证据。PostgreSQL 对已编写资产和关系事件保持权威，图数据库仅作为派生投影。写入失败时必须记录 **`MCP synchronization blocked`**、失败原因和重试触发条件，登记待办事实。MCP 记录和必要关系写入并核验成功前，ADR 与实现都不能标记为完成。

### 联邦治理事实

联邦治理核心决策必须把已交付的增量与未来的连接器交付明确区分。只有在具备针对性证据时，契约、范围、审计、可靠投递、候选事实、权威策略和只读对账事实才能标记为已实现。存量发现扫描器、持续入站连接器、出站 Proposal 以及外部 `APPLY` 在拥有各自受 Scope 约束的 ADR、Proposal、Context Pack、证据和 MCP 对账记录前均保持延期。
