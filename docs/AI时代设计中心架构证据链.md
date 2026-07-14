# AI 时代设计中心架构：结论与证据链

> 项目建议名称：**SpecForge Design Center / 智设中枢**  
> 架构定位：**MCP-native AI Design Center for Spec-driven Software Development**  
> 核心目标：让 Codex / Claude Code / Cursor / Copilot 等 AI Coding Agent 在写代码前，能够通过 MCP 获取可信设计上下文、影响分析、规则校验和架构约束。

---

## 1. 总体结论

AI 时代的设计中心不应该只是“设计文档管理平台”，而应该升级为：

> **面向人类与 AI Agent 共同使用的设计事实源、上下文生成器、影响分析引擎和研发治理中枢。**

建议架构如下：

```text
SpecForge Design Center

┌──────────────────────────────┐
│          Web Console          │
│  给人类架构师、产品、开发、测试使用 │
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│       Core Domain Service     │
│  设计资产 / 图谱 / 规则 / 影响分析 │
│  Proposal / ADR / Context Pack │
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│          MCP Server           │
│  Resources / Tools / Prompts  │
│  给 AI Coding Agent 交互使用    │
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│       AI Coding Agents        │
│ Codex / Claude Code / Cursor  │
└──────────────────────────────┘
```

对应模块：

```text
SpecForge
├── Web Console
│   └── 人类管理台：设计资产、Proposal、ADR、规则结果、图谱
│
├── Core Domain Service
│   ├── 设计资产模型
│   ├── 设计知识图谱
│   ├── 影响分析
│   ├── 规则校验
│   ├── Context Pack 生成
│   ├── Proposal 管理
│   ├── ADR 管理
│   └── 审计日志
│
├── MCP Server
│   ├── Resources：设计资产读取
│   ├── Tools：设计操作能力
│   ├── Prompts：设计流程模板
│   └── Auth / Audit / Policy
│
└── Integrations
    ├── Git / Repo
    ├── CI/CD
    ├── API Gateway
    ├── MQ / Schema Registry
    ├── CMDB
    ├── APM / Tracing
    └── DevOps / 需求系统
```

---

## 2. 为什么是 MCP-first 架构？

### 2.1 说明

如果最终交互入口是 Codex 等 AI Coding Agent，那么设计中心不能只提供 Web 页面，而必须提供 Agent 可调用的标准接口。MCP 正好提供了这种接口抽象。

在 MCP 里：

| MCP 能力 | 设计中心对应物 |
|---|---|
| Resources | 领域模型、数据模型、API 契约、事件契约、ADR、状态机、Proposal、Context Pack |
| Tools | 搜索设计资产、生成 Context Pack、影响分析、规则校验、创建 Proposal、创建 ADR |
| Prompts | 设计特性、评审方案、生成 API 契约、生成事件契约、生成测试计划、生成编码上下文 |

因此，设计中心应该是 **MCP-first**，而不是 **Web-first**。

### 2.2 证据

- MCP 官方定义：MCP 是连接 AI 应用与外部系统的开放标准，AI 应用可以连接数据源、工具和工作流。[^mcp-intro]
- MCP 规范说明：MCP 让应用可以向语言模型共享上下文、暴露工具和能力、构建可组合的集成与工作流。[^mcp-spec]
- MCP Server 的基本能力包括 Prompts、Resources、Tools：Prompts 是预定义模板，Resources 是结构化上下文，Tools 是可执行函数。[^mcp-server-overview]
- Codex CLI 官方文档已经支持 `codex mcp` 管理 MCP Server，也支持 `codex mcp-server` 通过 stdio 把 Codex 自身作为 MCP Server 运行。[^codex-mcp]

### 2.3 推导

```text
Codex / Agent 需要读取设计上下文
→ MCP 是当前 AI 应用连接外部系统的标准化协议
→ 设计中心应该暴露 MCP Server
→ Web UI 只作为人类管理台
```

### 2.4 架构结论

```text
Core Service
  ├── Web Console：给人使用
  └── MCP Server：给 Agent 使用
```

---

## 3. 为什么要有 Core Domain Service？

### 3.1 说明

Web UI 和 MCP Server 都只是入口，真正的业务能力应该沉淀在 Core Domain Service 里。

如果把业务逻辑写在 Web 页面里，MCP Server 会重复实现一套逻辑；如果把业务逻辑写在 MCP Server 里，Web 管理台也会变成旁路。因此必须把资产、规则、影响分析、Context Pack、审计等能力沉到统一核心层。

### 3.2 证据

- MCP 架构文档说明 Server 应该提供专门的上下文和能力，并通过 Resources、Tools、Prompts 暴露给客户端；它也强调 Server 应该有聚焦的职责、可组合、易构建。[^mcp-architecture]
- Backstage Software Catalog 证明了“统一软件资产目录 + 元数据 + ownership + 外部工具集成”的价值，它把目录作为组织管理大量服务、库、网站、数据管道等资产的中心。[^backstage-catalog]
- Backstage 还说明 Software Catalog 是组织基础设施工具的组织入口，可以减少团队在多个基础设施界面之间切换的认知负担。[^backstage-catalog]

### 3.3 推导

```text
Web 和 MCP 都需要同一套设计资产与治理能力
→ 业务逻辑不能分散在入口层
→ 需要 Core Domain Service 作为设计中心内核
```

### 3.4 架构结论

Core Domain Service 至少应包括：

```text
searchDesignAssets()
getAssetDetail()
renderAssetAsMarkdown()
analyzeProposalImpact()
generateContextPack()
runGovernanceChecks()
createProposal()
updateProposal()
createAdr()
linkAssets()
buildAssetGraph()
```

---

## 4. 为什么要做 Spec / Proposal / Context Pack？

### 4.1 说明

AI 编码最大的问题不是“不会写代码”，而是“需求、设计意图、边界、规则、上下文不完整”。因此，设计中心要把自然语言需求转为结构化 Proposal，再生成 Agent 可消费的 Context Pack。

建议流程：

```text
Requirement
→ Proposal
→ Spec Delta
→ Impact Analysis
→ Governance Check
→ Agent Context Pack
→ Coding Agent Implementation
→ Verification
→ Archive
```

### 4.2 证据

- OpenSpec 官方定位是面向 coding agents 和 CLI 的轻量级 spec-driven framework，并且原生支持 Claude Code、Cursor、Codex、GitHub Copilot、Gemini CLI 等工具。[^openspec]
- Superpowers 官方把自己定义为面向 coding agents 的完整软件开发方法论，由一组可组合 skills 和初始指令构成。[^superpowers]
- Superpowers 的 subagent-driven development 文档强调：Controller 要精确挑选所需上下文，Subagent 在开始前获得完整信息，任务评审要同时看 spec compliance 和 code quality。[^superpowers-subagent]
- 2026 年关于 Spec-driven Development 的论文把 SDD 描述为把规格作为事实源、代码作为生成或验证的二级产物，并讨论了 AI coding assistants 背景下 spec-first、spec-anchored、spec-as-source 的实践。[^sdd-paper]

### 4.3 推导

```text
AI Coding Agent 容易在上下文不足时误解需求
→ 业界出现 OpenSpec / Superpowers 这类 spec-first 工具
→ 设计中心应该内置 Proposal、Spec、任务、验收、Context Pack
→ Context Pack 成为 Agent 写代码前的标准输入
```

### 4.4 架构结论

Context Pack 应该包含：

```text
# Agent Context Pack

## Feature Summary
## Business Background
## Goals
## Non-goals
## Impacted Assets
## Domain Model Context
## Data Model Context
## API Contracts
## Event Contracts
## Business Rules
## State Machines
## Architecture Decisions
## Quality Requirements
## Observability Requirements
## Implementation Tasks
## Test Suggestions
## Constraints and Do-not Rules
```

---

## 5. 为什么设计资产不只包括 API / MQ，还要包括领域模型、数据模型、业务规则、状态机？

### 5.1 说明

API 和 MQ 只是系统边界。AI 真正容易犯错的地方，往往是业务概念、字段语义、状态流转、业务规则和历史约束。

因此，AI 时代设计中心要管理的不只是接口，而是完整设计资产体系。

建议资产体系：

```text
业务资产
├── 领域模型
├── 业务流程
├── 业务规则
├── 状态机
└── 术语表

契约资产
├── API 契约
├── 事件契约
├── 集成契约
├── 数据契约
└── 消费方契约

数据资产
├── 概念数据模型
├── 逻辑数据模型
├── 物理数据模型
├── 数据字典
├── 数据血缘
└── 数据分类分级

架构资产
├── 4+1 / C4 视图
├── 服务地图
├── 依赖关系
├── 部署拓扑
├── ADR
└── 架构规则

质量资产
├── 非功能需求
├── 安全隐私
├── 可观测性
├── 测试设计
├── SLO
└── 运维预案

AI 资产
├── Context Pack
├── Prompt 模板
├── Agent Skill
├── Review Checklist
├── 组织编码规范
└── 设计生成模板
```

### 5.2 证据

- Backstage Software Catalog 官方说明，它是集中管理整个软件生态 ownership 和 metadata 的系统，覆盖 services、websites、libraries、data pipelines 等资产。[^backstage-catalog]
- Backstage System Model 把 Components、APIs、Resources 作为核心实体；其中 APIs 被定义为组件边界，并且需要已知、机器可读的格式，以便构建进一步工具和分析。[^backstage-system-model]
- OpenAPI 说明 API 需要用标准、语言无关的接口描述，让人和计算机在不看源代码、额外文档或抓包的情况下理解服务能力。[^openapi]
- AsyncAPI 说明 message-driven APIs 也需要机器可读描述，而且协议无关，可覆盖 Kafka、AMQP、MQTT、WebSocket 等。[^asyncapi]

### 5.3 推导

```text
大型企业系统不是孤立 API，而是服务、数据、事件、规则、流程、运行指标的网络
→ Developer Portal / Software Catalog 已证明资产目录和元数据管理有价值
→ AI Agent 需要比人更结构化的上下文
→ 设计中心必须扩展为完整设计资产库
```

### 5.4 架构结论

优先级最高的资产不是 API，而是：

```text
P0：领域模型
P0：数据模型
P0：业务规则
P0：状态机
P0：API 契约
P0：事件契约
```

---

## 6. 为什么数据模型是 P0 资产？

### 6.1 说明

AI 写代码时如果只知道字段名和类型，很容易误解字段业务语义。例如 `refund_amount` 可能是“本次退款金额”，也可能是“累计退款金额”。如果设计中心不维护字段语义、约束、敏感等级、血缘和消费方，AI 就可能生成业务错误或合规风险代码。

数据模型不应该只是表结构，而应该分三层：

```text
概念数据模型：业务概念，例如订单、支付、退款、用户
逻辑数据模型：实体关系，例如 Order 1 - N Refund
物理数据模型：表、字段、索引、约束，例如 t_refund.refund_amount
```

字段级资产应该包括：

```yaml
fieldName: refund_amount
displayName: 本次退款金额
dataType: bigint
unit: cent
meaning: 本次退款金额，不是累计退款金额
nullable: false
constraint: refund_amount <= refundable_amount
classification: internal
sensitiveLevel: none
example: 1299
owner: order-domain
```

### 6.2 证据

- Open Data Contract Standard 官方定义了 YAML 数据契约中应包含的 key 和 value，并把 schema、quality、SLA、team、roles、support 等拆成标准部分。[^odcs]
- Bitol 对 ODCS 的介绍说明，它定义的是数据契约开放标准，并覆盖 Schema、Data Quality、Pricing、Security、SLA 等方面。[^bitol]
- DataHub Lineage 官方说明，数据血缘是展示数据在组织中如何流动的地图，说明数据从哪里来、如何流转、最终到哪里。[^datahub-lineage]
- DataHub Lineage SDK 支持表级和列级血缘，覆盖 datasets、data jobs、dashboards、charts，并支持读取上下游。[^datahub-lineage-sdk]

### 6.3 推导

```text
AI 修改字段或生成数据访问代码时，必须理解字段语义、约束、敏感性和上下游影响
→ 仅有表结构不足
→ 需要数据契约、数据字典、分类分级、数据血缘
→ 数据模型应成为设计中心 P0 资产
```

### 6.4 架构结论

设计中心应内置：

```text
Data Model
├── Conceptual Model
├── Logical Model
├── Physical Model
├── Field Semantics
├── Constraints
├── Classification
├── Lineage
├── Lifecycle
└── Consumer Usage
```

---

## 7. 为什么 API / Event 要做成“契约”，而不是文档？

### 7.1 说明

AI Agent 更适合消费结构化、机器可读、可校验、可生成测试的契约，而不是自然语言接口说明。API 和事件是系统间协作边界，必须有版本、兼容性、消费者、错误码、幂等、重试等治理信息。

### 7.2 证据

- OpenAPI 规范定义的是标准、语言无关的 HTTP API 接口描述，让人和计算机无需访问源代码、额外文档或网络流量即可理解服务能力。[^openapi]
- AsyncAPI 规范用于以机器可读方式描述 message-driven APIs，并且协议无关，可用于 Kafka、AMQP、MQTT、WebSocket 等。[^asyncapi]
- AsyncAPI 关于 event-driven APIs 的文档说明，异步系统之间交换的信息需要被一致地文档化和维护，AsyncAPI 规范正是为解决这个缺口而来。[^asyncapi-practical]
- OASBuilder 研究指出，AI agents 和业务自动化工具与外部服务交互时，需要标准化、机器可读的 API 规格；非结构化 HTML 文档需要大量人工转换。[^oasbuilder]

### 7.3 推导

```text
AI Agent 需要稳定、机器可读的系统边界
→ API 用 OpenAPI 表达
→ Event / MQ 用 AsyncAPI 或 Schema Contract 表达
→ 设计中心管理的是 Contract，不是普通文档
```

### 7.4 架构结论

接口与消息资产应命名为：

```text
API Contract
Event Contract
Data Contract
Integration Contract
Consumer Contract
```

---

## 8. 为什么要有设计知识图谱和影响分析？

### 8.1 说明

AI Agent 如果只读取孤立文档，很难判断“改一个字段会影响哪些系统、API、事件、测试、报表、运行指标”。设计中心必须维护设计资产之间的关系，形成知识图谱。

典型链路：

```text
Requirement
→ Proposal
→ Domain Model
→ Data Model
→ API Contract
→ Event Contract
→ Business Rule
→ State Machine
→ Code Module
→ Test Case
→ Release
→ Runtime Metric
→ Incident
```

### 8.2 证据

- Backstage Software Catalog 本身提供 Catalog Graph 能力，并把软件资产建模为 components、APIs、resources 等相关实体。[^backstage-catalog]
- Backstage System Model 说明组件可以实现 API、消费其他组件 API，也可能依赖运行时资源。[^backstage-system-model]
- Microsoft GraphRAG 官方说明，GraphRAG 是一种结构化、层级化的 RAG 方法，不同于只使用纯文本片段的朴素语义搜索；它会从文本中抽取知识图谱、构建社区层级，并利用这些结构执行 RAG 任务。[^graphrag]

### 8.3 推导

```text
设计资产天然存在依赖关系
→ AI Agent 需要关系上下文，不只是文本片段
→ 图谱比孤立文档更适合影响分析
→ 设计中心应该内置 Asset Graph 和 Impact Analysis
```

### 8.4 架构结论

必须实现：

```text
buildAssetGraph(domainId?)
analyzeProposalImpact(proposalId)
searchDesignAssets(query)
getAssetDetail(assetType, assetId)
```

---

## 9. 为什么要有 ADR 和架构视图？

### 9.1 说明

AI 经常会提出“看起来合理”的方案，但这些方案可能违反历史架构决策。ADR 和架构视图的价值，就是把“为什么这么设计”和“哪些路不能走”显式化。

ADR 记录决策背景、候选方案、最终选择、后果、约束和过期条件。架构视图负责让 Agent 理解系统边界、容器、组件、部署和交互关系。

### 9.2 证据

- Michael Nygard 在 2011 年提出记录架构重大决策的 ADR 思路，强调要保存影响结构、非功能特征、依赖、接口或构建技术的重要决策。[^nygard-adr]
- ADR 官方资料定义 Architectural Decision 是一个有理由的设计选择，用于处理架构上重要的功能或非功能需求。[^adr-github]
- C4 Model 官方说明，它用于帮助软件团队在前期设计和回顾性文档中描述、沟通软件架构，是不同细节层级的“代码地图”。[^c4-intro]

### 9.3 推导

```text
AI Agent 需要知道系统为什么是现在这样
→ ADR 记录历史决策和约束
→ C4 / 4+1 视图提供结构地图
→ Context Pack 必须包含 Architecture Decisions 和 Do-not Rules
```

### 9.4 架构结论

Context Pack 中必须有：

```text
Architecture Decisions
Architecture Views
Constraints
Do-not Rules
```

---

## 10. 为什么要有 Governance Check？

### 10.1 说明

AI 会显著加快代码生成速度，也会加快设计漂移、兼容性破坏和隐性风险扩散。设计中心必须提供自动化规则校验，把架构规则、契约规则、安全规则、数据规则、测试规则变成可执行检查。

### 10.2 证据

- Pact 官方定义 Pact 是 code-first consumer-driven contract testing 工具，生成的契约来自消费者自动化测试；它的价值在于只测试消费者实际使用的交互，从而降低 provider 改动破坏消费者的风险。[^pact]
- Evolutionary Architecture 官方说明，fitness functions 用尽可能自动化的方式明确系统在当前环境下什么叫“fit”。[^fitness]
- MCP Tools 规范说明 Tools 是 model-controlled，模型可以根据上下文和用户提示自动发现并调用工具；因此工具调用必须考虑 trust & safety。[^mcp-tools]

### 10.3 推导

```text
AI 让变更速度提升
→ 变更越快，越需要自动化治理
→ Pact / Contract Testing 证明契约可自动化验证
→ Fitness Function 证明架构质量也可自动化检查
→ 设计中心应提供 Governance Check
```

### 10.4 架构结论

必须内置：

```text
runGovernanceChecks(targetType, targetId)

检查内容：
├── API 规则
├── Event 规则
├── Data Model 规则
├── Business Rule 规则
├── Proposal 规则
├── Security 规则
├── Observability 规则
└── Architecture Rule
```

---

## 11. 为什么要有权限、审计和工具分级？

### 11.1 说明

MCP Tool 不是普通后台接口，而是可能被模型自动发现和调用的工具。只要允许 Agent 创建 Proposal、修改 ADR、建立资产关系，就必须有参数校验、权限预留、审计日志、写操作保护和人类确认机制。

### 11.2 证据

- MCP Tools 规范明确：Tools 是 model-controlled，语言模型可以基于上下文和用户提示自动发现并调用工具。[^mcp-tools]
- MCP Tools 规范还建议，为了 trust & safety 和安全，应该有人类处于回路中，应用应清楚展示暴露给模型的工具，并在工具调用时给出清晰提示，对操作提供确认。[^mcp-tools]
- MCP Security Best Practices 官方文档专门讨论 MCP 实现中的安全风险、攻击向量和最佳实践，面向 MCP 授权实现者、Server 运营者和安全专业人员。[^mcp-security]

### 11.3 推导

```text
MCP Tool 可能被 Agent 自动调用
→ 写操作存在误用和越权风险
→ 必须做只读/写入工具分级
→ 必须记录审计日志
→ 必须预留 Auth / Policy / Permission
```

### 11.4 架构结论

工具分级建议：

```text
Read Tools
├── search_design_assets
├── get_asset_detail
├── analyze_proposal_impact
├── generate_context_pack
└── run_governance_checks

Write Tools
├── create_proposal
├── update_proposal
├── create_adr
└── link_assets
```

审计日志模型：

```text
AuditLog
├── actorType: user / agent / system
├── actorId
├── channel: web / mcp / api
├── action
├── targetType
├── targetId
├── inputSummary
├── outputSummary
├── status
├── errorMessage
└── createdAt
```

---

## 12. 为什么 Web Console 仍然需要？

### 12.1 说明

虽然 Agent 通过 MCP 交互，但人类仍需要查看、维护、评审、修正设计资产。尤其是领域模型、数据模型、ADR、规则和影响分析，不能完全交给 AI 自动维护。

Web Console 的价值是：

```text
人类查看事实源
人类维护资产
人类评审 Proposal
人类确认高风险变更
人类查看审计和治理结果
```

### 12.2 证据

- MCP Tools 规范建议工具调用要有人类在回路中，并让用户清楚看到暴露给模型的工具、调用提示和确认流程。[^mcp-tools]
- Backstage Software Catalog 证明了人类需要一个统一入口来浏览、搜索、维护大量软件资产，并让团队维护自己拥有的 metadata。[^backstage-catalog]

### 12.3 推导

```text
AI Agent 负责执行和生成
→ 人类负责决策、评审和治理
→ Web Console 是人类管理台
→ MCP Server 是 Agent 交互入口
```

### 12.4 架构结论

Web Console 重点页面：

```text
Dashboard
Design Assets
Proposals
Context Packs
Graph
Governance
ADRs
Audit Logs
Settings
```

---

## 13. 为什么要接 Git / CI / API Gateway / MQ / APM？

### 13.1 说明

设计中心不能只停留在“设计态”，否则很快会和真实代码、真实运行状态脱节。要形成闭环，就必须接入开发态、测试态、运行态数据。

闭环如下：

```text
Design
→ Code
→ Test
→ Release
→ Runtime
→ Feedback
→ Design Update
```

### 13.2 证据

- Backstage Software Catalog 使用存放在源代码仓库里的 metadata YAML 作为事实源，并通过 Git workflow 维护元数据。[^backstage-catalog]
- Pact 说明契约来自自动化消费者测试，并用于验证 provider 是否满足消费者期望。[^pact]
- DataHub Lineage 说明数据血缘可以展示数据从来源到最终消费位置的流动路径，这意味着设计资产需要连接运行和消费事实。[^datahub-lineage]
- Evolutionary Architecture 说明系统要尽可能自动化地明确什么叫 fit，并支持技术和领域变化。[^fitness]

### 13.3 推导

```text
设计如果不连接代码和运行态，就会漂移
→ Git / CI 连接代码事实
→ API Gateway / MQ 连接契约运行事实
→ APM / Tracing 连接实际调用链和质量事实
→ 设计中心要做持续治理，而不是一次性设计评审
```

### 13.4 架构结论

后续集成优先级：

```text
P0：Git / Repo
P0：CI/CD
P1：API Gateway
P1：MQ / Schema Registry
P1：APM / Tracing
P2：CMDB
P2：需求系统
P2：测试平台
```

---

## 14. 最终推导链

### 14.1 总推导

```text
AI Coding Agent 需要上下文
→ 所以要 Context Pack

上下文不能是散文
→ 所以要结构化设计资产和契约

Agent 需要标准方式访问
→ 所以要 MCP-first

Agent 会快速改代码
→ 所以要规则校验和漂移检测

企业系统关系复杂
→ 所以要设计知识图谱和影响分析

历史决策不能丢
→ 所以要 ADR 和架构视图

写操作有风险
→ 所以要权限、审计和工具分级

人类仍然要评审和治理
→ 所以要 Web Console

设计不能脱离真实系统
→ 所以要接 Git / CI / Gateway / MQ / APM
```

### 14.2 最终架构结论

```text
AI 时代设计中心
= MCP Server
+ Core Domain Service
+ Web Console
+ Design Asset Repository
+ Context Pack Generator
+ Governance Engine
+ Asset Graph / Impact Analysis
+ ADR / Architecture View
+ Audit / Permission / Policy
+ Runtime Integrations
```

---

# 15. 证据链汇总

## 15.1 MCP / Agent Tooling 证据链

**事实：** MCP 是连接 AI 应用与外部系统、数据源、工具和工作流的开放标准。  
**来源：** MCP 官方文档。[^mcp-intro]  
**推导：** 设计中心如果要给 Codex / Claude Code / Cursor 等 Agent 使用，就应该提供 MCP Server，而不是只提供 Web UI。

**事实：** MCP Server 能暴露 Prompts、Resources、Tools 三类能力。Resources 提供上下文，Tools 提供动作，Prompts 提供模板。  
**来源：** MCP Server Overview、Resources、Tools、Prompts 官方规范。[^mcp-server-overview] [^mcp-resources] [^mcp-tools] [^mcp-prompts]  
**推导：** 设计资产应作为 Resources，影响分析/规则校验/Context Pack 生成应作为 Tools，设计流程应作为 Prompts。

**事实：** Codex CLI 官方支持管理 MCP Server，也支持把 Codex 自身作为 MCP Server 通过 stdio 运行。  
**来源：** OpenAI Codex CLI 文档。[^codex-mcp]  
**推导：** MCP 是 Codex 生态中的实际集成机制，SpecForge 应该优先兼容 stdio MCP Server。

---

## 15.2 Spec-driven Development 证据链

**事实：** OpenSpec 是面向 coding agents 和 CLI 的轻量级 spec-driven framework。  
**来源：** OpenSpec 官方网站。[^openspec]  
**推导：** AI 开发应从规格开始，设计中心应管理 Proposal、Spec、Task、Context Pack。

**事实：** Superpowers 是面向 coding agents 的完整软件开发方法论，并强调完整上下文、spec compliance 和 code quality。  
**来源：** Superpowers GitHub 与 subagent-driven development 文档。[^superpowers] [^superpowers-subagent]  
**推导：** 设计中心应该把设计流程、评审流程和上下文选择标准化，避免 Agent 直接“凭感觉写代码”。

**事实：** Spec-driven Development 在 AI coding assistants 背景下重新受到关注，其核心是规格作为事实源，代码作为生成或验证的二级产物。  
**来源：** 2026 年 SDD 论文。[^sdd-paper]  
**推导：** 设计中心的中心资产应从“文档”转为“规格”。

---

## 15.3 Developer Portal / Software Catalog 证据链

**事实：** Backstage Software Catalog 是集中管理软件生态 ownership 和 metadata 的系统。  
**来源：** Backstage 官方文档。[^backstage-catalog]  
**推导：** 设计中心也需要统一资产目录，只是对象从“软件资产”扩展到“设计资产”。

**事实：** Backstage System Model 中 APIs 是组件之间的边界，并需要机器可读格式，以便进一步 tooling 和 analysis。  
**来源：** Backstage System Model。[^backstage-system-model]  
**推导：** 设计中心不应只存自然语言接口文档，而应存契约和结构化资产。

---

## 15.4 API / Event / Data Contract 证据链

**事实：** OpenAPI 是标准、语言无关的 HTTP API 描述，便于人和计算机理解服务能力。  
**来源：** OpenAPI 规范。[^openapi]  
**推导：** API 应作为机器可读契约管理。

**事实：** AsyncAPI 用于机器可读地描述 message-driven APIs，且协议无关。  
**来源：** AsyncAPI 规范。[^asyncapi]  
**推导：** MQ / Event 也应作为契约管理，而不是只登记 Topic 和字段。

**事实：** ODCS 定义了 YAML 数据契约中的字段和结构，并覆盖 schema、quality、SLA、team 等信息。  
**来源：** Open Data Contract Standard。[^odcs]  
**推导：** 数据模型应升级为数据契约，包含语义、质量、SLA、owner、分类分级等。

**事实：** DataHub Lineage 把数据血缘定义为数据在组织中流动的地图。  
**来源：** DataHub Lineage 官方文档。[^datahub-lineage]  
**推导：** 数据模型必须包含血缘，AI 修改字段时才能分析上下游影响。

---

## 15.5 Architecture / ADR / Graph 证据链

**事实：** ADR 用来记录架构重大决策，包括结构、非功能特征、依赖、接口或构建技术。  
**来源：** Michael Nygard ADR 原文。[^nygard-adr]  
**推导：** 设计中心应存 ADR，避免 AI 违反历史架构决策。

**事实：** C4 Model 用于在不同细节层级上描述和沟通软件架构，是“代码地图”。  
**来源：** C4 Model 官方介绍。[^c4-intro]  
**推导：** 4+1 / C4 / 架构视图应该成为 Agent Context 的一部分。

**事实：** GraphRAG 是结构化、层级化的 RAG 方法，会构建知识图谱并利用图结构进行检索。  
**来源：** Microsoft GraphRAG 官方文档。[^graphrag]  
**推导：** 设计资产之间的关系应图谱化，用于影响分析和上下文检索。

---

## 15.6 Governance / Safety 证据链

**事实：** Pact 是 consumer-driven contract testing 工具，能验证 provider 是否满足消费者实际使用的交互。  
**来源：** Pact 官方文档。[^pact]  
**推导：** API / Event 契约需要可测试、可验证，设计中心应提供契约校验。

**事实：** Evolutionary Architecture 用 Fitness Functions 自动化表达系统在某环境下什么叫 fit。  
**来源：** Evolutionary Architecture 官方网站。[^fitness]  
**推导：** 架构规则、质量属性、非功能要求都应变成自动化规则校验。

**事实：** MCP Tools 是 model-controlled，模型可能自动发现并调用工具，官方建议有人类在回路中，并提供可见性和确认。  
**来源：** MCP Tools 规范。[^mcp-tools]  
**推导：** 设计中心 MCP Server 必须有权限、审计、工具分级和写操作保护。

---

# 16. 参考来源

[^mcp-intro]: Model Context Protocol 官方介绍：<https://modelcontextprotocol.io/docs/getting-started/intro>  
[^mcp-spec]: Model Context Protocol Specification 2025-06-18：<https://modelcontextprotocol.io/specification/2025-06-18>  
[^mcp-server-overview]: MCP Server Features Overview：<https://modelcontextprotocol.io/specification/2025-06-18/server>  
[^mcp-resources]: MCP Resources Specification：<https://modelcontextprotocol.io/specification/2025-06-18/server/resources>  
[^mcp-tools]: MCP Tools Specification：<https://modelcontextprotocol.io/specification/2025-06-18/server/tools>  
[^mcp-prompts]: MCP Prompts Specification：<https://modelcontextprotocol.io/specification/2025-06-18/server/prompts>  
[^mcp-architecture]: MCP Architecture：<https://modelcontextprotocol.io/specification/2025-06-18/architecture>  
[^mcp-security]: MCP Security Best Practices：<https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices>  
[^codex-mcp]: OpenAI Codex CLI Reference：<https://developers.openai.com/codex/cli/reference>  
[^openspec]: OpenSpec 官方网站：<https://openspec.dev/>  
[^superpowers]: Superpowers GitHub：<https://github.com/obra/superpowers>  
[^superpowers-subagent]: Superpowers Subagent-driven Development：<https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/SKILL.md>  
[^sdd-paper]: Spec-Driven Development: From Code to Contract in the Age of AI Coding Assistants：<https://arxiv.org/abs/2602.00180>  
[^backstage-catalog]: Backstage Software Catalog：<https://backstage.io/docs/features/software-catalog/>  
[^backstage-system-model]: Backstage System Model：<https://backstage.io/docs/features/software-catalog/system-model/>  
[^openapi]: OpenAPI Specification：<https://swagger.io/specification/>  
[^asyncapi]: AsyncAPI Specification：<https://www.asyncapi.com/docs/reference/specification/latest>  
[^asyncapi-practical]: AsyncAPI Practical Example：<https://www.asyncapi.com/blog/understanding-asyncapis>  
[^oasbuilder]: OASBuilder: Generating OpenAPI Specifications from Online API Documentation with Large Language Models：<https://arxiv.org/abs/2507.05316>  
[^odcs]: Open Data Contract Standard：<https://bitol-io.github.io/open-data-contract-standard/v3.1.0/>  
[^bitol]: Bitol / Open Data Contract Standard：<https://bitol.io/>  
[^datahub-lineage]: DataHub Lineage：<https://docs.datahub.com/docs/features/feature-guides/lineage>  
[^datahub-lineage-sdk]: DataHub Lineage SDK：<https://docs.datahub.com/docs/api/tutorials/lineage>  
[^nygard-adr]: Documenting Architecture Decisions, Michael Nygard：<https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions>  
[^adr-github]: Architecture Decision Records：<https://adr.github.io/>  
[^c4-intro]: C4 Model Introduction：<https://c4model.com/introduction>  
[^graphrag]: Microsoft GraphRAG：<https://microsoft.github.io/graphrag/>  
[^pact]: Pact Documentation：<https://docs.pact.io/>  
[^fitness]: Building Evolutionary Architectures / Fitness Functions：<https://evolutionaryarchitecture.com/>
