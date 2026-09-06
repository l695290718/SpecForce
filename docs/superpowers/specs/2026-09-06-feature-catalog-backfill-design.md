# Feature Catalog Backfill

## Purpose

Populate first-class, bilingual Feature records for every existing authored design asset in the exact application-service Scope `com.huawei.celon.desiner`. The resulting catalog must make stakeholder value, observable system behavior, and supporting design assets queryable without changing the authority of the existing assets.

## Preconditions

The local MCP development principal must include `knowledge:consume` in addition to its existing asset, graph, and governance permissions. The backfill starts only after `evaluate_system_knowledge_readiness` and `read_system_knowledge` succeed for the exact Scope. Direct PostgreSQL reads and direct asset-detail reads are not substitutes for the knowledge gate.

## Catalog Model

Service Features describe externally valuable product outcomes. Functional Features describe independently observable behaviors that contribute to one or more Service Features. The initial catalog groups the existing SpecForge assets into these value areas:

- Governed design authoring and decision records.
- Design-asset catalog and contract management.
- Architecture modeling and 3A views.
- Relationship, impact, and ER analysis.
- System knowledge, context, and consistency reconciliation.
- Federation and legacy-system discovery.
- Requirement assessment and delivery evidence.
- Exact-Scope identity, authorization, and operational governance.

Functional Features are decomposed from those value areas only when the bounded knowledge inventory provides supporting assets and relationships. A feature must not be created merely because an implementation file, table, or individual API exists.

## Relationship Rules

- `FunctionalFeature --CONTRIBUTES_TO--> ServiceFeature` expresses value decomposition.
- APIs and operations `EXPOSE` Functional Features.
- Functional Features `READ` or `WRITE` data models, entities, and fields; they `CONSUME` or `EMIT` event contracts.
- Business rules `GOVERN`, state machines `CONTROL`, quality assets `VERIFY`, ADRs `DECIDE`, Proposals `IMPACT`, and Context Packs `IMPLEMENTS_CONTEXT_FOR` relevant Features when the existing scoped graph supports the claim.
- Each pre-existing authored asset must receive a justified direct Feature relationship when the current ontology permits it, or an evidenced indirect path through its existing API, Proposal, or other ontology-supported neighbor. Assets with neither path are retained in an explicit exception manifest with the blocking ontology reason; they are not linked through invented relationship types. Shared assets may relate to multiple Functional Features. No cross-Scope endpoint is allowed.

## Write Protocol

1. Repair the local development-principal permission gap and verify the bounded readiness-gated inventory.
2. Produce a deterministic mapping manifest from inventory asset IDs, types, names, and existing relationships. English is canonical; every human-facing Feature field receives a Chinese overlay.
3. Run `prepare_design_change` with the exact Scope and the existing Feature ADR, Proposal, Context Pack, and mapped design facts.
4. Submit one dry-run `apply_feature_change_set`, then one committed idempotent Change Set containing Service Features, Functional Features, and typed links. If the approved payload exceeds Change Set limits, split it into deterministic, independently complete value-area batches and retain the common correlation root.
5. Verify list, detail, graph, and coverage reads through MCP; then close the same design-change session with exact command evidence.

The process never rewrites the meaning of existing APIs, models, rules, or decisions. PostgreSQL remains authoritative; graph and search structures are derived projections.

## Failure Handling

If knowledge readiness is denied, a target endpoint is absent, localization is incomplete, or the dry-run reports a version conflict, commit nothing. Record the reason and retry trigger as a backlog fact or blocked session. A partial relationship map must not be represented as complete coverage.

## Verification

Success requires:

- exact-Scope readiness and bounded system-knowledge reads succeed;
- every new Feature has canonical English and complete Chinese localized content;
- every existing authored asset has a direct mapping, an evidenced indirect path, or an explicit ontology-limited exception with rationale;
- Feature Change Set dry-run and committed receipts agree on asset and relationship counts;
- MCP list/detail/graph/coverage reads return the expected localized catalog; and
- the design-change session closes as `CONVERGED` with evidence.

## 中文说明

本设计在精确 Scope `com.huawei.celon.desiner` 中，为全部既有已编写设计资产补齐一级“服务特性”和二级“功能特性”。服务特性描述可交付的外部价值，功能特性描述可独立观察和验证的系统行为；API、数据模型、事件、业务规则、状态机、质量需求、ADR、Proposal 和 Context Pack 通过有类型关系提供可追溯支撑，不能把单个表、文件或接口机械等同于特性。

写入前必须先修复本地 MCP 开发主体缺少 `knowledge:consume` 的权限，再通过就绪门禁读取有界系统知识。随后使用精确 Scope 的 MCP 预检、预演和原子 Feature Change Set 写入双语资产及关系。若超出 Change Set 上限，按可独立完成的价值域确定性分批；任何失败、缺失本地化、版本冲突或未就绪状态均不得部分提交，并必须留下阻塞原因和重试条件。
