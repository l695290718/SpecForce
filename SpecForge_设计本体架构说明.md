# SpecForge Design Center：本体驱动架构说明

## 1. 核心结论

SpecForge Design Center 本身不是本体（Ontology），而是：

> 一个基于 Design Ontology（设计本体）的 MCP-native AI 设计中心。

关系：

```text
SpecForge Design Center
|
├── Design Ontology（设计本体）
│   定义设计对象、语义、关系、约束
│
├── Knowledge Graph（知识图谱）
│   存储真实系统设计资产关系
│
├── MCP Server
│   给 AI Agent 提供访问入口
│
└── Web Console
    给人类架构师和研发人员管理
```

---

# 2. 什么是设计本体？

设计本体用于描述企业软件研发世界：

- 什么是领域？
- 什么是系统？
- 什么是服务？
- 什么是 API？
- 什么是事件？
- 什么是数据模型？
- 什么是业务规则？
- 什么是状态机？
- 什么是 ADR？
- 什么是 Proposal？

以及：

- 对象之间有什么关系？
- 哪些关系合法？
- 哪些关系违反架构约束？

---

# 3. 元模型、本体、知识图谱区别

| 概念 | 作用 | 示例 |
|-|-|-|
| Meta Model | 定义如何存储 | 表结构、字段、类型 |
| Ontology | 定义语义和关系 | API 属于服务，事件由服务发布 |
| Knowledge Graph | 本体实例化 | Order Service 发布 OrderCreated Event |

示例：

## 本体

```text
API Contract provides boundary between Services

Event Contract published by Service

Data Model belongs to Domain

ADR constrains Design Asset

Proposal impacts Design Asset
```

## 知识图谱

```text
Order Service
    |
    publishes
    ↓
OrderCreated Event

CreateRefund API
    |
    uses
    ↓
Refund Data Model
```

---

# 4. 为什么 AI 时代需要设计本体？

传统：

```text
需求
 ↓
文档
 ↓
开发
 ↓
代码
```

AI 时代：

```text
需求
 ↓
设计本体
 ↓
结构化设计资产
 ↓
Context Pack
 ↓
AI Agent
 ↓
代码
 ↓
验证
```

原因：

AI Agent 不仅需要文本，还需要理解：

- 对象含义
- 对象关系
- 架构约束
- 历史决策

---

# 5. Design Ontology 核心模型

## Business Asset

```text
DomainModel
BusinessCapability
BusinessProcess
BusinessRule
StateMachine
GlossaryTerm
```

关系：

```text
DomainModel contains Entity

BusinessRule constrains StateMachine

StateMachine governs Entity
```

---

## Contract Asset

```text
API Contract
Event Contract
Data Contract
Integration Contract
Consumer Contract
```

关系：

```text
Service provides API Contract

Service publishes Event Contract

API Contract uses Data Model

Event Contract carries Data Model
```

---

## Data Asset

```text
Conceptual Data Model
Logical Data Model
Physical Data Model
Data Field
Data Dictionary
Data Classification
Data Lineage
```

关系：

```text
Data Model belongs to Domain

Data Field belongs to Data Model

Data Lineage connects Data Assets
```

---

## Architecture Asset

```text
System
Service
Component
Architecture View
Deployment Model
ADR
```

关系：

```text
System contains Service

Service provides API

ADR constrains Architecture Asset
```

---

## AI Asset

```text
Proposal
Context Pack
Prompt Template
Agent Skill
Review Checklist
Governance Rule
```

关系：

```text
Proposal impacts Design Asset

Context Pack includes Design Asset

Governance Rule validates Design Asset
```

---

# 6. SpecForge 三层架构

## 第一层：设计本体层

负责：

- 定义对象
- 定义关系
- 定义约束
- 定义语义


## 第二层：设计资产实例层

例如：

```text
订单域

Domain:
Order

Data Model:
Refund

API:
CreateRefund

Event:
RefundSucceeded

Rule:
refund_amount <= refundable_amount

ADR:
Refund uses async notification
```


## 第三层：平台能力层

提供：

```text
Search

Graph Query

Impact Analysis

Context Pack Generation

Governance Check

MCP Tool

Web Management
```

---

# 7. 本体驱动影响分析

普通 CRUD：

```text
API表
Event表
Data表
```

只能查询。

本体驱动：

```text
修改 Refund.amount

↓

影响：
- Refund Data Model
- CreateRefund API
- RefundSucceeded Event
- Accounting Integration
- Test Case
- ADR
```

因为系统理解：

```text
Refund.amount

belongs to Refund Model

used by CreateRefund API

carried by RefundSucceeded Event
```

---

# 8. MCP 与本体关系

MCP 不是本体。

关系：

```text
Design Ontology
        |
Knowledge Graph
        |
Core Service
        |
MCP Server
        |
AI Agent
```

本体解决：

> 这些东西是什么？有什么关系？

MCP解决：

> AI 如何访问这些东西？

---

# 9. 最终定位

SpecForge 最准确定义：

> 一个以设计本体为语义底座，通过 MCP 服务 AI Agent 的 AI 原生设计治理平台。

英文：

> Ontology-driven MCP-native AI Design Center

---

# 10. 给 Codex 的关键要求

构建 SpecForge 时：

```text
The system must be ontology-driven.

Define a Design Ontology that describes:

- design asset types
- semantic relationships
- allowed relations
- governance constraints

The following capabilities must depend on the ontology:

- asset graph
- impact analysis
- governance checks
- context pack generation
- MCP resource exposure
```

核心思想：

```text
不是管理设计文档。

而是管理企业软件设计世界的语义模型。
```
