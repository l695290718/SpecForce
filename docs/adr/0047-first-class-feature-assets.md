# ADR-0047: First-Class Service And Functional Feature Assets

## Status

Accepted. P0 core governance, P1 search/coverage/read-only Web delivery, P2 knowledge/downstream reconciliation, and Scope governance Feature coverage repair are implemented and locally verified. The readiness-gated Feature catalog backfill command is implemented and locally verified. Catalog curation uses the catalog-only Profile; source-code inventory remains a separate, stricter future capability.

- Stable ADR ID: `adr-first-class-feature-assets`.
- Proposal: `proposal-first-class-feature-assets` (`reviewing`).
- Context Pack: `context-pack-first-class-feature-assets`.
- Owner: SpecForge Product Architecture and Design Governance.
- Scope: `com.huawei.celon.desiner`.
- Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- Design session: `design-change-session:8c02a714-28d0-49bd-8154-77d26adc42e1`.
- P0 implementation session: `design-change-session:57f4bbdc-737e-4909-a967-e1bd8c447397`.
- P1 implementation session: `design-change-session:651a22ca-02c2-4184-9385-76515e9285a5`.
- P2 implementation session: `design-change-session:35142ca0-2b85-4813-b7a0-61ccae6bd8b9`.
- Catalog-read repair session: `design-change-session:abc0062b-50a2-4d6f-8370-4bc4b22c61d8`.
- Feature relationship coverage audit session: `design-change-session:28454fd1-cfa8-4dec-85ce-8f8193c7dcbb`.
- Scope governance coverage repair session: `design-change-session:a57589bc-a668-4a86-82a3-278fd143f412`.
- Specification: `docs/superpowers/specs/2026-09-02-first-class-feature-assets-design.md`.

## Context

SpecForge can govern contracts, rules, data, behavior, architecture, decisions, changes, and evidence, but it lacks a first-class value-to-function layer. Requirements cannot currently trace through a stakeholder-visible outcome to the functional behaviors and implementation assets that deliver it. Treating Feature as a label, 3A unit, API alias, or strict tree would lose independent identity, reuse, versioning, and impact semantics.

## Decision

1. Add `serviceFeature` and `functionalFeature` as two concrete types in the independent conceptual Feature asset family, using the existing scoped `DesignAsset` lifecycle rather than new tables.
2. Define Service Feature as an externally visible, stakeholder-valued outcome and Functional Feature as an independently verifiable system behavior. English canonical content and structurally complete Chinese overlays are mandatory.
3. Own every Feature in one exact application-service Scope. Permit same-Scope many-to-many `FunctionalFeature --CONTRIBUTES_TO--> ServiceFeature` relationships; defer cross-Scope reuse to a separately governed template/reference design.
4. Relate Functional Features to APIs, events, rules, state machines, quality requirements, data models/entities/fields, implementation identities, decisions, proposals, observations, and current-version evidence through the typed relationship ontology. Feature-to-3A mappings do not turn Features into architecture units.
5. Make `apply_feature_change_set` the primary MCP write boundary. It supports dry-run, idempotency, optimistic concurrency, bounded batches, stable errors, and one PostgreSQL transaction across authored assets, revisions, graph nodes, relationship events, audit, and Outbox.
6. Keep the Web Feature workspace read-only. Provide scoped pagination, bilingual details, and a bounded interactive relationship graph.
7. Separate authored lifecycle from computed coverage, evidence, and consistency dimensions. Verification evidence is valid only for the current Feature version/content digest.
8. Deliver in P0 core governance, P1 Web/search/coverage, and P2 system-knowledge/downstream reconciliation increments. Each requires its own implementation preflight, evidence, MCP synchronization, and reconciliation.
9. Include Service and Functional Features in readiness-gated bounded system knowledge, Context Packs, impact analysis, and requirement assessments; incomplete Feature coverage remains an explicit uncertainty.
10. Bind implementation evidence to Feature version/content digest. Mark stale evidence and implementation drift explicitly, and invalidate active relationships when a Feature is retired in the same MCP transaction while retaining authored history.
11. Build any catalog-wide Feature backfill only from receipt-bound, exact-Scope `DESIGN_CATALOG_CURATION` knowledge. The planner creates bilingual Service/Functional Features and direct ontology-valid links, records unsupported or unproven mappings as explicit exceptions, and sends one bounded, idempotent MCP Change Set. It must not synthesize child-node identities that the knowledge read contract did not supply. Source-code inventory remains separate and may only use source-dependent Profiles after governed scanning.

## Consequences

- Positive: requirements gain an explicit, queryable path from value through system behavior to contracts, data, implementation, and evidence.
- Positive: same-Scope reuse avoids duplicate Functional Features without weakening isolation.
- Positive: atomic Change Sets prevent partially persisted Feature graphs.
- Tradeoff: the asset type union, localization maps, repository catalog, ontology, projections, MCP contracts, Web navigation, and downstream consumers must all evolve together.
- Tradeoff: derived delivery truth requires version-bound evidence and cannot be inferred reliably from relationship presence alone.
- Tradeoff: readiness and assessment consumers must carry Feature coverage and provenance, while retirement invalidation adds graph-ledger writes to Feature updates.
- Deferred: cross-Scope Feature reuse, enterprise templates, automated implementation discovery, and production-scale graph certification require separate decisions.
- Deferred coverage facts: 16 Proposal assets have no persisted typed relationship and therefore no evidence-bound Feature target; `integration-specforge-mcp-agent` is connected to an API but the current ontology does not permit a direct Integration-to-Feature link; Context Packs remain reachable through their governed Proposal path rather than a direct Feature link. Owner: Product Architecture and Design Governance. Retry when the Proposal's typed impact targets are authored, or when an ontology change for Integration/Context Pack semantics is separately approved and synchronized.

## Alternatives

- A single `feature` type with a subtype inside the current string payload was rejected because subtype filtering and constraints would be weak.
- Dedicated ServiceFeature and FunctionalFeature tables were rejected because they duplicate the established authored-asset lifecycle.
- Independent asset and relationship writes were rejected because partial success creates inconsistent graphs.
- Strict parent-child composition was rejected because a Functional Feature may contribute to multiple Service Features.

## Evidence

- Industry review used the OMG summary of ISO/IEC/IEEE 29148, SEBoK function definitions, ITU-T Feature terminology, and the OASIS SOA service-functionality model; the sources support external value, functional decomposition, and reusable capability, while confirming that the exact two-type taxonomy must be explicit in SpecForge.
- `rg` inspection of `prisma/schema.prisma`, `packages/core/src/types.ts`, and `packages/core/src/relationships/ontology.ts` confirmed the existing generic `DesignAsset`, canonical-English/localized-overlay contract, exact-Scope identity, and typed relationship ledger.
- `pnpm design-context:preflight -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner ...` returned OPEN session `design-change-session:8c02a714-28d0-49bd-8154-77d26adc42e1`, read 463 scoped assets, and recorded reconciliation `UNVERIFIED` rather than blocked.
- `pnpm exec vitest run scripts/sync-design-facts.test.ts scripts/reconcile-design-facts.test.ts --exclude '**/.worktrees/**' --exclude '**/.pnpm-store/**'` passed 2 files and 33 tests for the synchronization and reconciliation contracts.
- `$env:SPECFORGE_DESIGN_FACT_IDS='first-class-feature-assets'; pnpm design-facts:sync` returned `complete` for `adr-first-class-feature-assets`; the first attempted write was rejected without partial persistence until the Chinese ADR arrays matched the canonical structure.
- `$env:SPECFORGE_DESIGN_FACT_IDS='first-class-feature-assets'; pnpm design-facts:check` returned no missing, mismatched, out-of-Scope, or blocked records and verified `first-class-feature-assets`.
- `pnpm exec vitest run packages/core/src/features/validation.test.ts packages/core/src/features/change-set.test.ts packages/core/src/__tests__/asset-localization.test.ts packages/core/src/__tests__/relationship-ontology.test.ts packages/core/src/__tests__/relationship-extraction.test.ts apps/mcp-server/src/features/service.integration.test.ts apps/mcp-server/src/tools.test.ts --exclude '**/.worktrees/**' --exclude '**/.pnpm-store/**'` passed 7 files and 103 tests.
- The PostgreSQL-backed Feature integration suite passed four scenarios: atomic mixed-asset commit, stable idempotent replay, non-persisting dry-run, stale-version rejection, bounded bilingual reads, exact-Scope denial, graph read, and preliminary coverage.
- `pnpm --filter @specforge/core typecheck` and `pnpm --filter @specforge/mcp-server typecheck` both exited `0`.
- P0 uses the existing durable `RelationshipCommandReceipt` with command type `APPLY_FEATURE_CHANGE_SET`; no second Feature asset table or redundant receipt subsystem was introduced.
- Implemented P0 behavior comprises the two Feature types, complete localization validation, relationship ontology v3, atomic Change Set service, search projection update, durable relationship events/Outbox, audit, stable errors, and bounded diagnostic reads.
- `pnpm exec vitest run packages/core/src/features/coverage.test.ts apps/mcp-server/src/features/projection.test.ts apps/mcp-server/src/scoped-read-projection.test.ts apps/web/lib/features.test.ts apps/web/components/features/feature-graph-model.test.ts apps/web/components/features/feature-workspace.test.tsx apps/web/lib/__tests__/assets-scope.test.ts apps/web/lib/__tests__/scope-links.test.ts` passed 23 discovered files and 115 tests; existing worktree copies were also discovered by the repository Vitest configuration.
- `pnpm --filter @specforge/core typecheck`, `pnpm --filter @specforge/mcp-server typecheck`, and `pnpm --filter @specforge/web typecheck` all exited `0`.
- `$env:SPECFORGE_NEXT_STANDALONE='0'; pnpm --filter @specforge/web build` compiled successfully, generated all 41 pages, and emitted `/features` plus its three read-only API routes. The default Windows OneDrive standalone packaging reached successful compilation and page generation but could not create pnpm symlinks (`EPERM`); Linux Docker standalone packaging remains the production verification boundary.
- Browser acceptance at `/features?scope=com.huawei.celon.desiner` verified service/function/graph navigation, exact Scope retention, read-only copy, empty authorized results without `503`, zero console errors, and a 390 px viewport with `scrollWidth === innerWidth`.
- Implemented P1 behavior comprises kind-aware coverage/evidence/consistency derivation, bilingual lifecycle search projection, HMAC-bound scoped pagination, read-only list/detail routes, and a bounded Sigma WebGL graph with pan, zoom, node dragging, type filters, and impact-path highlighting.
- `pnpm exec vitest run packages/core/src/features packages/core/src/context-pack/generate.test.ts packages/core/src/requirement-assessment apps/mcp-server/src/relationships/command-service.test.ts apps/mcp-server/src/features apps/mcp-server/src/knowledge-readiness --exclude '**/.worktrees/**' --exclude '**/.pnpm-store/**'` passed 17 files and 52 tests; 11 database-dependent tests were skipped because the integration switch was not enabled.
- `pnpm typecheck` exited `0` for Core, knowledge-query, knowledge-projector, MCP Server, and Web.
- `$env:SPECFORGE_NEXT_STANDALONE='0'; pnpm build` compiled and generated all 41 Web pages and Feature routes successfully; existing React Hook and dynamic identity dependency warnings remain non-blocking.
- `powershell -NoProfile -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1 -ConfigurationOnly` passed Compose topology validation.
- `powershell -NoProfile -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1 -Live` built all six images, started the PostgreSQL/bootstrap/projector/3A/Web/worker chain, restarted Web, and passed asset-count persistence verification. The connector-worker image was corrected to include its identity and scoped-read workspace dependencies.
- P2 downstream knowledge, Context Pack, requirement-assessment, evidence/drift reconciliation, and transactional retirement relationship invalidation are implemented and locally verified. Cross-Scope reuse, enterprise templates, automated implementation discovery, and production-scale graph certification remain deferred.
- The earlier `ARCHITECTURE_OVERVIEW` dry-run correctly stopped before any write because it required `SOURCE_CODE`; that Profile was the wrong boundary for authored Feature catalog curation. The correction uses `DESIGN_CATALOG_CURATION` under `design-change-session:e2b4f990-1953-4dc2-8336-fe128736cfa4` and preserves strict source-dependent Profiles.
- A live catalog read exposed that new `serviceFeature` and `functionalFeature` records were not initialized in the scoped in-memory catalog, causing `undefined.push()` and making MCP preflight fail with a generic federation error. The catalog now initializes both collections and the graph builder treats absent optional collections as empty for older catalogs. `pnpm db:push` synchronized the locally deployed canonical schema before verification; no authored asset payload was changed.
- `pnpm exec vitest run --root . --exclude "**/.worktrees/**" --exclude "**/.pnpm-store/**" packages/core/src/__tests__/core.test.ts apps/mcp-server/src/scoped-derived.test.ts` passed the Feature catalog and legacy graph regressions. The exact-Scope preflight then opened `design-change-session:abc0062b-50a2-4d6f-8370-4bc4b22c61d8`, read 520 assets, and returned `UNVERIFIED` rather than a blocked reconciliation.
- `pnpm design-context:preflight -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --intent "Complete evidenced Feature relationship coverage" --affected "adr-first-class-feature-assets,adr-system-knowledge-readiness-gate,data-specforge-asset-graph" --evidence "feature-relationship-readback=knowledge-readiness:cbb90cd3b86bda35d179aaa0d9defb08,feature-gaps=identified,scope=com.huawei.celon.desiner"` returned OPEN session `design-change-session:28454fd1-cfa8-4dec-85ce-8f8193c7dcbb`, read 523 exact-Scope assets and 755 relationships, and returned reconciliation `UNVERIFIED` rather than blocked.
- MCP `evaluate_system_knowledge_readiness` with `DESIGN_CATALOG_CURATION`, followed by paginated `read_system_knowledge` in the exact Scope, reported 8 Service Features, 23 Functional Features, 461 Feature-linked relationships, and 149 non-evidence Feature relationships. Domain and ADR coverage was complete; no unlinked Proposal had an evidenced target; the single Integration was connected to an API but direct Integration-to-Feature mapping was ontology-unsupported.
- `pnpm feature-catalog:backfill -- --dry-run --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --session design-change-session:28454fd1-cfa8-4dec-85ce-8f8193c7dcbb --page-size 200` correctly refused full replay with `FEATURE_VERSION_CONFLICT` for an existing Feature asset; no relationship or authored asset was written. The audit therefore used a relation-only decision and did not invent links.
- `apply_feature_change_set` in `design-change-session:a57589bc-a668-4a86-82a3-278fd143f412` passed dry-run and atomically persisted `ff-scope-governance-identity` plus two exact-Scope relationships: `ff-scope-governance-identity --CONTRIBUTES_TO--> sf-scope-governance` and `api-specforge-scoped-read --EXPOSES--> ff-scope-governance-identity`. The receipt advanced the catalog to `2075` and graph to `9813`.
- MCP `evaluate_system_knowledge_readiness(DESIGN_CATALOG_CURATION)` followed by paginated `read_system_knowledge` and `validate_feature_coverage` returned 32 Features, 757 relationships, `COMPLETE=32`, `PARTIAL=0`, and `UNMAPPED=0`; both `ff-scope-governance-identity` and `sf-scope-governance` returned `COMPLETE`.

## Constraints

- MCP remains the only Feature write boundary; Web remains read-only.
- PostgreSQL remains authoritative; graph and search stores remain derived projections.
- Direct Feature reads cannot bypass system-knowledge readiness enforcement for Agent understanding.
- Missing, stale, denied, or unavailable evidence is reported explicitly and never converted to zero impact or verified status.
- Repository and MCP records must share stable IDs and exact Scope before this design is considered synchronized.
- Deferred coverage fact: 16 Proposal assets have no persisted typed relationship and therefore no bindable Feature target; `integration-specforge-mcp-agent` is connected to an API but the current ontology does not permit Integration to connect directly to a Feature; Context Packs remain reachable through their governed Proposal path rather than a direct Feature link. Owner: Product Architecture and Design Governance. Retry after typed Proposal impact targets are authored, or after Integration/Context Pack ontology semantics are separately approved and synchronized.

## 中文本地化覆盖内容

### 标题

一等服务特性与功能特性资产

### 状态

设计已接受。P0 核心治理、P1 搜索/覆盖/只读 Web 交付、P2 系统知识/下游对账以及范围与身份治理特性覆盖修复已经实现并完成本地验证。就绪门禁后的特性目录回填命令已实现并完成本地验证。目录编排使用仅目录的 Profile；源码库存仍是独立且更严格的后续能力。稳定 ADR、Proposal、Context Pack、负责人、精确 Scope、设计会话和规格路径见文首元数据。

### 背景

SpecForge 已能治理契约、规则、数据、行为、架构、决策、变更和证据，但缺少连接价值与功能的一等设计层。需求目前无法从利益相关方可感知的结果追踪到交付它的功能行为和实现资产。把 Feature 当成标签、3A 单元、API 别名或严格树结构都会丢失独立身份、复用、版本和影响语义。

### 决策

1. 将 `serviceFeature` 和 `functionalFeature` 作为独立 Feature 概念资产族的两种具体类型，复用现有 Scope `DesignAsset` 生命周期，不新建专表。
2. 服务特性表示外部可见且具有利益相关方价值的结果；功能特性表示可独立验证的系统行为。英文规范内容与结构完整的中文覆盖均为强制要求。
3. 每个 Feature 归属一个精确应用服务 Scope；允许同 Scope 内多对多的“功能特性贡献到服务特性”关系；跨 Scope 复用延期到独立治理的模板/引用设计。
4. 通过关系本体把功能特性连接到 API、事件、规则、状态机、质量需求、模型/实体/字段、实现身份、决策、提案、观测和当前版本证据。Feature 到 3A 的映射不会把它变成架构单元。
5. 以 `apply_feature_change_set` 作为主要 MCP 写入边界，支持预演、幂等、乐观并发、有界批次、稳定错误，并在一个 PostgreSQL 事务中提交资产、修订、图节点、关系事件、审计和 Outbox。
6. Web 特性工作区保持只读，提供 Scope 分页、双语详情和有边界交互关系图。
7. 将人工生命周期与计算得到的覆盖、证据和一致性维度分离；验证证据只有绑定当前 Feature 版本/摘要时才有效。
8. 分 P0 核心治理、P1 Web/搜索/覆盖和 P2 系统知识/下游对账交付；每阶段都需要独立实施预检、证据、MCP 同步和对账。
9. 将服务特性和功能特性纳入就绪门禁后的有界系统知识、上下文包、影响分析和需求评估；不完整的 Feature 覆盖必须作为显式不确定性保留。
10. 将实现证据绑定到 Feature 版本/内容摘要，明确标记证据过期和实现漂移；Feature 退休时在同一 MCP 事务中使活动关系失效，同时保留编写历史。
11. 任何目录级 Feature 回填只能消费受回执绑定的精确 Scope `DESIGN_CATALOG_CURATION` 知识。规划器创建双语服务/功能特性和本体合法的直接关系，将不支持或无法证明的映射记录为明确例外，并发送单个有界、幂等的 MCP Change Set；不得为知识读取契约未提供的子节点身份编造端点。源码库存保持独立，只有在受治理扫描后才能使用依赖源码的 Profile。

### 后果

- 需求可以从价值明确追踪到系统行为、契约、数据、实现和证据。
- 同 Scope 复用减少功能特性重复，同时不削弱隔离。
- 原子 Change Set 防止残缺 Feature 图。
- 资产类型、本地化、目录、关系本体、投影、MCP、Web 和下游消费者需要协同演进。
- 交付事实依赖绑定版本的证据，不能只凭存在关系就可靠推导。
- 就绪门禁和评估消费者需要携带 Feature 覆盖与来源信息，退休失效会为 Feature 更新增加图账本写入。
- 跨 Scope 复用、企业模板、自动实现发现和生产规模图认证分别延期决策。
- 覆盖延期事实：16 个 Proposal 没有持久化的有类型关系，因此没有可绑定的 Feature 目标；`integration-specforge-mcp-agent` 虽连接 API，但当前本体不允许 Integration 直接连接 Feature；Context Pack 通过受治理 Proposal 间接到达，而不是直接连接 Feature。负责人是产品架构与设计治理；待 Proposal 补充有类型影响目标，或单独批准并同步 Integration/Context Pack 本体语义后重试。

### 备选方案

- 未采用 Payload 内隐藏子类型的单一 `feature`，因为筛选和约束较弱。
- 未建立两张 Feature 专表，因为会复制现有资产生命周期。
- 未采用资产和关系分次写入，因为部分成功会形成不一致图。
- 未采用严格父子组合，因为一个功能特性可以贡献到多个服务特性。

### 证据

- 业界审阅使用 OMG 对 ISO/IEC/IEEE 29148 的摘要、SEBoK 功能定义、ITU-T Feature 术语和 OASIS SOA 服务功能模型；这些来源支持外部价值、功能分解和可复用能力，同时确认 SpecForge 必须明确自己的二类特性定义。
- 对 `prisma/schema.prisma`、`packages/core/src/types.ts` 和 `packages/core/src/relationships/ontology.ts` 的只读检查确认现有通用资产、英文规范字段与中文覆盖、精确 Scope 身份和关系账本。
- 精确 Scope 预检返回 OPEN 会话 `design-change-session:8c02a714-28d0-49bd-8154-77d26adc42e1`，读取 463 条资产，最近对账为 `UNVERIFIED` 而非阻塞。
- 设计事实同步与对账脚本的 2 个测试文件、33 项测试全部通过。
- 仅选择 `first-class-feature-assets` 的 MCP 同步返回 `complete`；首次写入因中文 ADR 数组结构不匹配而被无部分落库地拒绝，修正后成功。
- 同一设计事实的对账结果中缺失、不匹配、越 Scope 和阻塞均为零，并验证 `first-class-feature-assets`。
- P0 实施会话为 `design-change-session:57f4bbdc-737e-4909-a967-e1bd8c447397`。
- P1 实施会话为 `design-change-session:651a22ca-02c2-4184-9385-76515e9285a5`。
- Feature 核心、本地化、本体、MCP 工具与 PostgreSQL 集成的聚焦测试共 7 个文件、103 项测试通过；其中数据库集成套件覆盖原子提交、幂等重放、预演不落库、版本冲突、双语有界读取、Scope 拒绝、图读取与初步覆盖。
- Core 与 MCP Server 的 TypeScript 检查均以退出码 `0` 完成。
- P0 复用现有 `RelationshipCommandReceipt` 并使用命令类型 `APPLY_FEATURE_CHANGE_SET`，没有新增第二套 Feature 资产表或重复回执子系统。
- P1 聚焦命令通过 23 个被发现文件与 115 项测试；仓库 Vitest 配置同时发现了现有 worktree 副本。
- Core、MCP Server 和 Web 的 TypeScript 检查均以退出码 `0` 完成。
- 关闭 standalone 后的 Web 生产构建编译成功并生成全部 41 个页面，包含 `/features` 及三条只读 API。Windows OneDrive 下的默认 standalone 构建已完成编译和页面生成，但 pnpm 符号链接创建被系统以 `EPERM` 拒绝；Linux Docker standalone 构建仍是生产打包验证边界。
- 浏览器验收确认服务/功能/图谱导航、精确 Scope 保留、只读提示、授权空结果不返回 `503`、控制台零错误，以及 390 像素窄屏没有横向溢出。
- P2 聚焦测试通过 17 个文件、52 项测试；11 个数据库集成测试因未启用集成开关而跳过。
- `pnpm typecheck` 对 Core、knowledge-query、knowledge-projector、MCP Server 和 Web 全部通过。
- `$env:SPECFORGE_NEXT_STANDALONE='0'; pnpm build` 成功编译并生成全部 41 个 Web 页面及 Feature 路由；既有 React Hook 和动态身份依赖警告不阻塞构建。
- Compose 配置校验和 Live 验证均通过；Live 验证构建六个镜像，启动 PostgreSQL/Bootstrap/投影/3A/Web/Worker 链路，重启 Web 后资产数量保持不变。为此修正了 connector-worker 镜像遗漏的 identity 与 scoped-read 工作区依赖。
- P2 已实现就绪门禁后的 Feature 系统知识、双语上下文包、需求评估中的 Feature 覆盖发现与证据类型、绑定版本/摘要的漂移对账，以及带持久图事件/Outbox 的退休关系事务失效。
- 当前声明 P2 下游系统知识、上下文包、需求评估、证据/漂移对账和退休关系失效已经实现并完成本地验证。跨 Scope 复用、企业模板、自动实现发现和生产规模图认证仍延期。
- 之前的 `ARCHITECTURE_OVERVIEW` 预演因要求 `SOURCE_CODE` 而在任何写入前正确停止；该 Profile 不适用于已编写 Feature 目录编排。修正后在 `design-change-session:e2b4f990-1953-4dc2-8336-fe128736cfa4` 中使用 `DESIGN_CATALOG_CURATION`，同时保留严格的依赖源码 Profile。
- 一次在线目录读取暴露出新的 `serviceFeature` 和 `functionalFeature` 记录没有在范围内存目录中初始化，导致 `undefined.push()`，进而让 MCP 预检返回泛化联邦错误。现在目录会初始化这两个集合，图构建器也会把旧目录中缺失的可选集合视为空集合。验证前使用 `pnpm db:push` 同步了本地部署的规范 Schema；没有改变任何已编写资产载荷。
- `pnpm exec vitest run --root . --exclude "**/.worktrees/**" --exclude "**/.pnpm-store/**" packages/core/src/__tests__/core.test.ts apps/mcp-server/src/scoped-derived.test.ts` 通过了 Feature 目录和旧图谱回归。随后精确 Scope 预检创建 `design-change-session:abc0062b-50a2-4d6f-8370-4bc4b22c61d8`，读取 520 项资产，并返回 `UNVERIFIED` 而非阻塞对账。
- `pnpm design-context:preflight -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --intent "Complete evidenced Feature relationship coverage" --affected "adr-first-class-feature-assets,adr-system-knowledge-readiness-gate,data-specforge-asset-graph" --evidence "feature-relationship-readback=knowledge-readiness:cbb90cd3b86bda35d179aaa0d9defb08,feature-gaps=identified,scope=com.huawei.celon.desiner"` 返回 OPEN 会话 `design-change-session:28454fd1-cfa8-4dec-85ce-8f8193c7dcbb`，读取 523 项精确 Scope 资产和 755 条关系，对账为 `UNVERIFIED` 而非阻塞。
- MCP `evaluate_system_knowledge_readiness` 使用 `DESIGN_CATALOG_CURATION`，随后在精确 Scope 内分页调用 `read_system_knowledge`，得到 8 个服务特性、23 个功能特性、461 条带 Feature 的关系和 149 条非证据 Feature 关系。领域和 ADR 覆盖完整；未关联 Proposal 没有可证明的目标；唯一 Integration 虽连接到 API，但当前本体不支持 Integration 到 Feature 的直接映射。
- `pnpm feature-catalog:backfill -- --dry-run --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --session design-change-session:28454fd1-cfa8-4dec-85ce-8f8193c7dcbb --page-size 200` 对已有 Feature 的全量重放正确返回 `FEATURE_VERSION_CONFLICT`；没有写入关系或资产。此次审计因此采用仅关系的判断，并没有臆造关系。
- `apply_feature_change_set` 在 `design-change-session:a57589bc-a668-4a86-82a3-278fd143f412` 中预演通过，并以一个原子事务写入 `ff-scope-governance-identity` 和两条精确 Scope 关系：`ff-scope-governance-identity --CONTRIBUTES_TO--> sf-scope-governance`、`api-specforge-scoped-read --EXPOSES--> ff-scope-governance-identity`。回执将目录推进到 `2075`、图推进到 `9813`。
- MCP `evaluate_system_knowledge_readiness(DESIGN_CATALOG_CURATION)`、分页 `read_system_knowledge` 与 `validate_feature_coverage` 回读得到 32 个 Feature、757 条关系，`COMPLETE=32`、`PARTIAL=0`、`UNMAPPED=0`；`ff-scope-governance-identity` 与 `sf-scope-governance` 均为 `COMPLETE`。

### 约束

- Feature 只能通过 MCP 写入，Web 保持只读。
- PostgreSQL 保持权威，图和搜索只作为派生投影。
- Agent 不能使用直接 Feature 查询绕过系统知识门禁。
- 缺失、过期、拒绝或不可用证据必须明确报告，不能转换为零影响或已验证状态。
- 仓库与 MCP 记录只有在稳定 ID 与精确 Scope 匹配后才算同步。
- 延期事实：16 个 Proposal 没有持久化的有类型关系，因此没有可绑定的 Feature 目标；`integration-specforge-mcp-agent` 虽连接 API，但当前本体不允许 Integration 直接连接 Feature；Context Pack 通过受治理 Proposal 间接到达，而不是直接连接 Feature。负责人是产品架构与设计治理；待 Proposal 补充有类型影响目标，或单独批准并同步 Integration/Context Pack 本体语义后重试。

### Workspace Catalog Regression Repair (2026-09-08)

- Cause: after persisted `serviceFeature` and `functionalFeature` assets were introduced, the optional Feature collections were not initialized in the scoped in-memory catalog. Workspace rendering then called `push()` on `undefined`.
- Decision: retain the shared `DesignAsset` lifecycle and exact-Scope reads; initialize both collections during Web catalog assembly, and route the two Feature entries in the workspace distribution to the existing read-only Service Feature and Functional Feature views. No data, authorization, or MCP write boundary changed.
- Verification: `pnpm exec vitest run apps/web/lib/__tests__/assets-scope.test.ts apps/web/lib/__tests__/dashboard.test.ts --exclude '**/.worktrees/**' --exclude '**/.pnpm-store/**'` passed 2 files and 10 tests; `pnpm --filter @specforge/web typecheck` exited `0`; the Docker Web image was rebuilt and `http://localhost:3010` returned 200 without a Next error boundary for `/workspace`, `/features`, `/assets/apis`, `/assets/data-models`, and `/architecture/3a`.
- Design session: `design-change-session:c6cd15ab-fa0e-47a6-9b10-7d3016b46d44` in exact Scope `com.huawei.celon.desiner`.

### 工作台目录回归修复（2026-09-08）

- 原因：新增 `serviceFeature` 和 `functionalFeature` 持久化资产后，范围目录的可选 Feature 集合没有初始化，工作台读取目录时对 `undefined` 调用 `push()`，导致服务端渲染失败。
- 决策：保持 Feature 复用通用 `DesignAsset` 和精确 Scope 读取，只在 Web 目录组装时初始化两个集合；工作台资产分布中的两类 Feature 分别导航到现有的服务特性与功能特性只读工作区。没有修改数据、权限或 MCP 写入边界。
- 验证：`pnpm exec vitest run apps/web/lib/__tests__/assets-scope.test.ts apps/web/lib/__tests__/dashboard.test.ts --exclude '**/.worktrees/**' --exclude '**/.pnpm-store/**'` 通过 2 个文件、10 个测试；`pnpm --filter @specforge/web typecheck` 退出码为 0；Docker Web 镜像重建并在 `http://localhost:3010` 验证 `/workspace`、`/features`、`/assets/apis`、`/assets/data-models` 和 `/architecture/3a` 均为 200，且无 Next 错误边界。
- 设计会话：`design-change-session:c6cd15ab-fa0e-47a6-9b10-7d3016b46d44`，精确 Scope 为 `com.huawei.celon.desiner`。

### Feature Relationship Graph Readability (2026-09-09)

- Decision: make the semantic Feature map the default graph mode. It renders a bounded three-column model of Service Features, Functional Features, and directly supporting design assets. The previous all-node relationship graph remains available as an explicit Full graph mode for governance and exploratory analysis.
- Decision: hide edge labels by default to preserve readable topology; show node type labels, a bilingual semantic legend, and selected-node direct relationships in the detail rail. Keep Sigma zoom, reset, drag, focus, and path highlighting available.
- Decision: graph mode is a read-only projection choice. It does not alter authored assets, relationship events, Scope authorization, PostgreSQL authority, or MCP write boundaries. Mode switching always reloads the exact owning Scope and resets type filters to the returned graph.
- Verification: `pnpm exec vitest run apps/web/components/features/feature-graph-model.test.ts apps/web/components/features/feature-workspace.test.tsx apps/web/lib/features.test.ts --exclude '**/.worktrees/**' --exclude '**/.pnpm-store/**'` passed 3 files and 8 tests; `pnpm --filter @specforge/web typecheck` exited `0`.
- Verification: Docker Web build compiled the `/features` route successfully after correcting a client/server import boundary; `Invoke-WebRequest` returned `200` without an error boundary for `/healthz`, the default Feature map, and `graphMode=all` on port `3010`.
- Design session: `design-change-session:b6c6526b-1826-4297-9ede-353cfd96de75`, exact Scope `com.huawei.celon.desiner`; preflight reconciliation was `UNVERIFIED` and not blocked.

### 特性关系图可读性（2026-09-09）

- 决策：默认使用语义化特性主视图，按“服务特性、功能特性、直接支撑设计资产”三列展示；原有全节点关系图保留为显式的“全量关系”模式，用于治理和探索分析。
- 决策：默认隐藏边上的关系文字，避免拓扑拥挤；通过双语语义图例、节点类型名称和选中节点详情中的直接关系摘要表达语义。继续保留 Sigma 缩放、复位、拖拽、聚焦和路径高亮能力。
- 决策：图谱模式只是只读投影选择，不改变已编写资产、关系事件、Scope 授权、PostgreSQL 权威性或 MCP 写入边界。模式切换始终重新读取当前精确 Scope，并根据新图重置类型过滤器。
- 验证：`pnpm exec vitest run apps/web/components/features/feature-graph-model.test.ts apps/web/components/features/feature-workspace.test.tsx apps/web/lib/features.test.ts --exclude '**/.worktrees/**' --exclude '**/.pnpm-store/**'` 通过 3 个文件、8 个测试；`pnpm --filter @specforge/web typecheck` 退出码为 `0`。
- 验证：修复客户端错误引入服务端模块的问题后，Docker Web 构建成功生成 `/features`；3010 端口的 `/healthz`、默认特性主视图和 `graphMode=all` 均返回 `200` 且没有错误边界。
- 设计会话：`design-change-session:b6c6526b-1826-4297-9ede-353cfd96de75`，精确 Scope 为 `com.huawei.celon.desiner`；预检对账为 `UNVERIFIED`，未阻塞。

### Feature Catalog Restoration (2026-09-11)

- Finding: the authoritative Docker PostgreSQL contained the original design-asset seed, but no `serviceFeature` or `functionalFeature` records. Local `.tmp` and `.specforge/feature-catalog` files were only disposable investigation artifacts and were not the source of truth.
- Correction: the MCP Feature Change Set validator now includes Feature endpoints submitted in the same atomic batch when validating relationships. This preserves one-transaction asset plus relationship creation and avoids incorrectly rejecting a relation whose new Feature endpoint does not exist yet.
- MCP execution: exact-Scope `DESIGN_CATALOG_CURATION` readiness allowed the bounded backfill. Dry-run planned 8 Service Features, 7 Functional Features, 34 ontology-valid relationships, and 27 direct mappings. Apply persisted all 15 Feature assets and 34 relationships with catalog version `45` and graph version `173`.
- Explicit exceptions: two Context Packs remain `ONTOLOGY_DIRECT_FEATURE_LINK_UNSUPPORTED`; one Proposal remains `GRAPH_ENDPOINT_NOT_PROJECTED`. These were retained as typed exceptions and were not converted into invented relationships.
- Verification: PostgreSQL readback for `com.huawei.celon.desiner` reports 8 `serviceFeature` assets, 7 `functionalFeature` assets, 7 `functionalFeature` nodes, 8 `serviceFeature` nodes, and 34 active Feature relationships. `/features?view=service`, `/features?view=functional`, and `/features?view=graph` on port `3010` returned `200` without an error boundary.
- Focused code verification: `pnpm exec vitest run packages/core/src/features/change-set.test.ts apps/mcp-server/src/features/catalog-backfill.test.ts apps/mcp-server/src/scoped-derived.test.ts --exclude '**/.worktrees/**' --exclude '**/.pnpm-store/**'` passed 3 files and 22 tests; `pnpm --filter @specforge/mcp-server typecheck` exited `0`.
- Design session: `design-change-session:ff767737-c30c-4b14-ae58-cd212641ba62`, exact Scope `com.huawei.celon.desiner`.

### 特性目录恢复（2026-09-11）

- 发现：权威 Docker PostgreSQL 中原有设计资产铺底仍在，但没有 `serviceFeature` 或 `functionalFeature` 记录。本地 `.tmp` 和 `.specforge/feature-catalog` 只是可丢弃的排查产物，不是权威数据源。
- 修正：MCP Feature Change Set 校验器现在会把同一原子批次中即将提交的 Feature 端点纳入关系校验，保持资产与关系一次事务提交，避免新 Feature 端点尚未存在时被错误拒绝。
- MCP 执行：精确 Scope 的 `DESIGN_CATALOG_CURATION` 就绪门禁通过。有界 dry-run 计划生成 8 个服务特性、7 个功能特性、34 条本体合法关系和 27 个直接映射；apply 通过 MCP 持久化全部 15 个 Feature 资产及 34 条关系，目录版本为 `45`，图版本为 `173`。
- 明确例外：2 个 Context Pack 保留 `ONTOLOGY_DIRECT_FEATURE_LINK_UNSUPPORTED`，1 个 Proposal 保留 `GRAPH_ENDPOINT_NOT_PROJECTED`。这些例外以有类型形式保留，没有虚构关系。
- 验证：对 `com.huawei.celon.desiner` 的 PostgreSQL 回读显示 8 个 `serviceFeature` 资产、7 个 `functionalFeature` 资产、7 个功能特性节点、8 个服务特性节点和 34 条活动特性关系。3010 端口的服务特性、功能特性和关系图页面均返回 `200`，且没有错误边界。
- 聚焦代码验证：`pnpm exec vitest run packages/core/src/features/change-set.test.ts apps/mcp-server/src/features/catalog-backfill.test.ts apps/mcp-server/src/scoped-derived.test.ts --exclude '**/.worktrees/**' --exclude '**/.pnpm-store/**'` 通过 3 个文件、22 个测试；`pnpm --filter @specforge/mcp-server typecheck` 退出码为 `0`。
- 设计会话：`design-change-session:ff767737-c30c-4b14-ae58-cd212641ba62`，精确 Scope 为 `com.huawei.celon.desiner`。
