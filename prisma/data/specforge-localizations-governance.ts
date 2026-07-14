import type {
  AdrLocalizedFields,
  BusinessRuleLocalizedFields,
  ContextPackLocalizedFields,
  IntegrationContractLocalizedFields,
  ObservabilityDesignLocalizedFields,
  ProposalLocalizedFields,
  QualityRequirementLocalizedFields
} from "@specforge/core";

export const businessRuleZhById: Record<string, BusinessRuleLocalizedFields> = {
  "rule-specforge-core-service-reuse": {
    name: "Web 与 MCP 必须复用核心服务",
    description: "Web 界面与 MCP 服务端处理设计资产时必须复用统一核心服务，不得在接入层重复实现业务规则。",
    condition: "任何由 Web 或 MCP 对外提供的设计操作，都能在核心服务中找到对应能力。",
    action: "只有在行为委托给核心服务时，才允许接入层做流程编排。",
    exception: "如果在页面路由或 MCP 处理器中复制业务逻辑，应视为违规并拒绝。",
    examples: ["上下文包生成通过统一核心能力完成。", "提案影响分析通过统一核心能力完成。"]
  },
  "rule-specforge-mcp-write-audit": {
    name: "MCP 写入操作必须留痕审计",
    description:
      "每一次 MCP 工具调用，尤其是写入操作，都必须记录审计信息，覆盖操作者、动作、目标、输入摘要、输出摘要与结果状态。",
    condition: "某个工具已经登记为平台对外提供的 MCP 工具。",
    action: "在工具处理流程外层统一加入审计记录能力。",
    exception: "即使执行失败，也要返回经过清理的错误，同时把审计失败细节保留在内部。",
    examples: [
      "设计资产写入会留下审计记录。",
      "提案写入会留下审计记录。",
      "上下文包写入会留下审计记录。",
      "上下文包生成会留下审计记录。"
    ]
  },
  "rule-specforge-seed-through-mcp": {
    name: "种子写入必须经过 MCP 工具",
    description: "数据库种子或导入流程写入设计资产时，必须走 MCP 写入链路，而不是直接调用底层持久化写入设计数据。",
    condition: "某个脚本正在填充设计资产、提案、上下文包或资产关系记录。",
    action: "通过 SpecForge 的 MCP 客户端执行设计资产、提案、上下文包和关系写入。",
    exception: "在 MCP 写入链路开始前，模式初始化或遗留数据清理可以暂时使用内部持久化能力。",
    examples: ["数据库种子流程通过 MCP 客户端启动写入。", "SpecForge 自设计资产通过 MCP 工具调用写入。"]
  },
  "rule-specforge-relationships-required": {
    name: "设计资产必须声明显式关系",
    description: "存在关联的设计资产必须用带类型的关系记录连接起来，便于图查询和后续影响分析沿依赖链追踪。",
    condition: "某个已持久化资产在说明、结构、生命周期、治理或工作流语义上引用了另一个资产。",
    action: "创建稳定的关系记录，明确拥有、约束、写入、发出、读取、生成、影响或验证等关系。",
    exception: "没有任何依赖的纯叶子资产可以省略显式关系。",
    examples: ["上下文包应连接提案及其受影响资产。", "治理规则应连接它约束的写入接口。", "图关系数据应能还原关键依赖。"]
  },
  "rule-bilingual-asset-completeness": {
    name: "双语资产内容必须完整",
    description: "任何进入治理快照的 MCP 资产都必须同时包含完整且语义一致的英文规范内容与中文本地化内容，缺一不可。",
    condition: "某次写入或快照持久化准备保存设计资产、提案、上下文包或相关治理结果。",
    action: "在持久化前验证英文规范字段与中文覆盖字段是否完整、结构一致且语义可读。",
    exception: "仅用于内部迁移的临时草稿可在进入正式持久化前短暂保留，但不得写入正式治理快照。",
    examples: ["缺少中文语义内容的写入会被拦截。", "同时具备完整英文与中文内容的写入可以通过验证。"]
  }
};

export const integrationZhById: Record<string, IntegrationContractLocalizedFields> = {
  "integration-specforge-mcp-agent": {
    name: "AI 代理到 SpecForge 的 MCP 集成",
    description: "本地 AI 编码代理通过 MCP 标准输入输出连接到 SpecForge，读取设计资产并调用设计工作流能力。",
    dataMapping: "工具入参与核心服务输入模型对齐，核心服务输出再映射为代理可消费的结果。",
    errorMapping: "核心服务错误会转换为安全、可对外暴露的工具错误，完整细节仅保留在内部审计中。",
    sla: "面向本地种子数据的工具调用应在十秒内返回。",
    timeout: "单次调用的超时时间为十秒。",
    retryStrategy: "读取类调用可谨慎重试；写入类调用因涉及审计与状态变更，需要更保守地处理重试。",
    fallbackStrategy: "如果 MCP 客户端暂不可用，可改由 Web 控制台提供只读访问与人工操作。",
    circuitBreaker: "熔断策略为后续远程部署预留，当前本地场景暂不启用。"
  }
};

export const qualityZhById: Record<string, QualityRequirementLocalizedFields> = {
  "quality-specforge-mcp-smoke": {
    name: "SpecForge MCP 冒烟验证质量要求",
    description: "MCP 服务端必须暴露完整的工具、资源与提示能力，并通过真实标准输入输出客户端的冒烟验证。",
    target: "冒烟验证需要覆盖读取工具、持久化写入工具、资源、模板、提示、搜索、上下文包生成与治理检查。",
    measurement: "执行仓库中的 MCP 冒烟验证命令并确认全部通过。",
    verificationMethod: "每次调整 MCP 工具、资源或提示能力后都要重新运行冒烟验证。"
  },
  "quality-specforge-impact-ready": {
    name: "SpecForge 影响分析就绪质量要求",
    description: "持久化资产必须具备足够明确的关系记录，使后续影响分析能够穿透合同、规则、模型、工作流与上下文包。",
    target: "种子完成后，自设计资产之间至少形成三十条可遍历的显式关系记录。",
    measurement: "统计已持久化关系记录数量，并确认关键图页面可见这些边。",
    verificationMethod: "执行种子流程后，验证图页面与图读取能力都能展示显式关系边。"
  }
};

export const observabilityZhById: Record<string, ObservabilityDesignLocalizedFields> = {
  "obs-specforge-mcp-audit": {
    name: "SpecForge MCP 审计可观测性设计",
    description: "用于跟踪 MCP 工具调用、审计写入失败以及上下文包生成结果，保证问题可见、可追溯。",
    alerts: ["五分钟内工具错误数量持续过高时触发告警。", "存在工具调用但审计记录没有同步增长时触发告警。"],
    dashboards: ["SpecForge MCP 运行态总览"],
    runbook: "先检查输入校验、资产标识、审计写入流程与核心服务异常，再定位具体调用链。",
    slo: "本地冒烟验证中的种子类 MCP 调用成功率应达到百分之九十九。"
  }
};

export const adrZhById: Record<string, AdrLocalizedFields> = {
  "adr-mcp-first-architecture": {
    name: "MCP 优先架构",
    description: "SpecForge 优先通过 MCP 暴露设计知识与设计工作流，Web 界面继续承担面向人的管理控制台角色。",
    title: "以 MCP 作为 AI 代理的主要接入界面",
    context: "SpecForge 面向需要在改动代码前先理解结构化设计事实、治理检查结果和实施上下文的 AI 编码代理。",
    decision:
      "构建独立的 MCP 服务端，并与 Web 控制台复用同一套核心服务；当前采用标准输入输出方式，未来再为远程部署预留更完整的接入能力。",
    alternatives: ["只向代理暴露传统接口。", "把所有设计工作流都塞进 Web 界面。", "让代理自行解析零散文档文件。"],
    consequences: [
      "代理获得稳定、协议原生的设计访问界面。",
      "核心服务边界会被强制收敛。",
      "每次工具调用都能统一落地审计和权限控制。"
    ],
    constraints: ["默认不得向外暴露删除类工具。", "写入类工具必须经过严格输入校验。", "对外错误信息必须做安全清理。"]
  },
  "adr-canonical-english-localized-overlay": {
    name: "英文规范与中文覆盖并存",
    description: "设计资产的顶层规范内容以英文为准，同时在同一份资产载荷内强制携带完整中文覆盖，避免知识分裂。",
    title: "采用英文规范字段加中文覆盖的同载荷方案",
    context:
      "SpecForge 既要保证代理处理时拥有稳定的一致语义，又要让中文使用者直接读取完整内容，不能把两套语言知识拆散到不同来源里。",
    decision:
      "所有顶层规范字段保留英文规范内容，并在同一资产载荷中要求完整中文覆盖；读取时按语言偏好合成视图，写入时统一校验双语完整性。",
    alternatives: ["把中文翻译单独放到独立翻译表中。", "为不同语言各维护一份重复资产。"],
    consequences: [
      "英文规范内容保持唯一事实来源。",
      "中文阅读体验可以在同一资产内获得完整表达。",
      "治理与写入校验必须同时检查规范字段和本地化覆盖。"
    ],
    constraints: [
      "中文覆盖必须与英文规范字段结构一致。",
      "同一资产中的双语内容必须在一次写入中同时提交。",
      "任何派生视图都不得绕过双语完整性校验。"
    ]
  }
};

export const proposalZhById: Record<string, ProposalLocalizedFields> = {
  "proposal-specforge-self-design": {
    name: "SpecForge MCP 优先自设计",
    description:
      "让 SpecForge 将自身架构、MCP 能力面、治理规则、AI 提供方抽象、本地持久化与代理上下文都作为一等设计资产进行管理。",
    title: "SpecForge MCP 优先自设计提案",
    background:
      "SpecForge 不应只是给人看的目录系统，它面向 AI 编码代理时必须提供可靠的结构化设计事实来源，覆盖领域概念、数据模型、接口契约、事件契约、状态机、业务规则、架构决策、治理检查与上下文包。\n\n因此，SpecForge 自身的设计也应生活在 SpecForge 内部，并通过未来代理会复用的同一条持久化路径写入与维护。",
    goal: "建立一套完整的自设计提案，使 SpecForge 的 MCP 优先架构能够同时被 Web 与 MCP 客户端查询。\n\n通过 MCP 工具把平台的领域、数据、接口、事件、规则、状态机、集成、质量、可观测性、架构决策、提案、上下文包与关系数据持久化到本地数据库。\n\n在暂不接入真实模型的前提下，为未来 AI 生成能力保留清晰边界。",
    nonGoal:
      "本提案不会取代现有书面规格文档；数据库中的设计资产是对文档的可查询、可治理、可关联补充。\n\n本提案不会接入真实大模型提供方；在当前阶段保留抽象边界与模拟能力即可。\n\n本提案不会通过 MCP 暴露危险的原始数据库操作；所有写入仍需保持类型化、可校验、可审计并与设计资产对齐。",
    scope:
      "范围包括 MCP 写入工具、本地持久化、自设计种子资产、资产关系链接、Web 浏览页面、提案详情内容、图筛选、治理可见性、上下文包生成以及 AI 提供方抽象。\n\n它同时规定了 SpecForge 如何把自己当作第一位客户来维护：设计变更不能只改代码，也要同步更新资产图谱与上下文包。",
    specChanges: [
      "定义 SpecForge 平台领域边界。",
      "持久化扩展后的设计资产、注册表、AI 生成、Web 工作区、资产图谱、国际化与审计数据模型。",
      "维护设计资产写入、提案写入、上下文包写入、资产搜索、治理检查、影响分析、文档导出和关系链接等能力契约。",
      "保持接口、事件与状态机资产足够完整，以支撑后续影响分析。",
      "继续保证 Web 与 MCP 复用统一核心服务。",
      "保留模拟生成能力，并为未来真实模型集成预留边界。",
      "使用本地数据库作为耐久存储，并通过 MCP 工具完成种子与更新。"
    ],
    risks: [
      "高：如果代码、种子数据、数据库状态与文档没有联动验证，自设计资产会与实现发生漂移。",
      "中：写入类工具能力增强后，对审计、校验和关系完整性的要求会显著提高。"
    ],
    rolloutPlan:
      "首先更新自设计种子数据，并通过 MCP 种子客户端写入本地数据库。\n\n其次验证提案详情页、MCP 冒烟验证、类型检查、静态检查与图页面。\n\n最后把这份提案作为后续 SpecForge 实施任务与上下文包的默认参考。",
    rollbackPlan:
      "可重新执行旧版提案载荷的种子写入，或者从种子模块中移除该自设计提案，使设计中心回退到只依赖外部文档的状态。\n\n这次回退不涉及模式变更，因为更新只调整提案内容。"
  },
  "proposal-strict-application-service-isolation": {
    name: "严格的应用服务隔离",
    description: "把每一次常规 Web 与 MCP 读写都绑定到一个明确、已授权的华为应用服务上。",
    title: "将应用服务范围收紧为硬性数据边界",
    background:
      "旧实现允许无范围数据行、默认回落以及不一致的服务切换，导致仪表盘、资产、图、治理与接口结果无法稳定反映当前服务。",
    goal: "让应用服务范围在页面、接口路由、仓储、MCP 工具、数据库查询、图构建与治理视图中保持强制一致。",
    nonGoal: "本次变更不提供跨服务聚合或对比视图；跨服务穿透分析留待后续显式工作流处理。",
    scope:
      "引入共享范围解析、继承式读取授权、仅服务内写入校验、按范围统计与链接、URL 和 Cookie 持续化，以及缺失或未授权范围时的失败关闭策略。",
    specChanges: [
      "所有数据库驱动的读取都必须带有已授权的应用服务标识。",
      "从常规视图中移除遗留内存回退和默认服务回退。",
      "仪表盘统计、提案、上下文包、治理检查、图节点、关系边和接口响应都按当前服务过滤。",
      "把当前服务选择保存在 URL 与经过校验的浏览器 Cookie 中。",
      "MCP 写入要求显式提交架构范围，MCP 读取要求显式提交应用服务标识。"
    ],
    risks: ["现有无范围数据在迁移前会变得不可见。", "如果调用方不继续传递服务上下文，缺失范围会直接导致关闭失败。"],
    rolloutPlan:
      "先部署共享范围校验，再通过 MCP 种子迁移持久化记录，最后启用按服务范围执行的 Web 与 MCP 查询并核对各服务统计。",
    rollbackPlan:
      "需要同时回退严格仓储约束与 MCP 签名变更，再恢复旧版种子载荷；不能只局部恢复默认回退，否则会重新引入跨服务泄漏。"
  },
  "proposal-agent-service-workspace": {
    name: "代理服务工作区",
    description: "把原先默认全局仪表盘的假设改成按代理与应用服务划分的独立工作区。",
    title: "创建按代理与应用服务划分的工作区",
    background: "全局仪表盘会把代理最近工作、草稿、待办和生成历史混在一起，而设计资产事实上属于具体应用服务。",
    goal: "在保持服务设计资产作为共享事实的同时，为每个代理与已授权应用服务持久化并恢复独立工作区状态。",
    nonGoal: "本次不为每个代理复制服务资产，也不实现已延期的跨服务对比仪表盘。",
    scope: "增加按代理类型、代理标识和应用服务标识组合建模的工作区，并把仪表盘指标和最近工作按当前服务收口。",
    specChanges: [
      "为每个代理和服务持久化一个工作区。",
      "恢复按服务分隔的最近资产、草稿、任务与生成历史。",
      "把仪表盘总量限定在当前服务范围内。",
      "保持共享服务资产与个人工作区状态彼此独立。"
    ],
    risks: ["如果服务选择没有被稳定保留，工作区状态会发生漂移。", "个人工作区状态绝不能改变共享设计资产的归属。"],
    rolloutPlan: "先建立工作区模型，在首次访问服务时初始化，再将仪表盘查询切换到当前服务。",
    rollbackPlan: "停止读取代理服务工作区并回退到仅按服务展示的仪表盘；保留已写入的工作区数据，以便后续迁移复用。"
  },
  "proposal-mcp-native-scoped-seeding": {
    name: "MCP 原生范围化种子",
    description: "让种子数据走与未来代理相同的已校验、可审计 MCP 写入路径。",
    title: "通过 MCP 为多服务范围化设计数据播种",
    background:
      "直接写入或旧版种子会产生无范围数据行，也会让模拟应用服务保持空白，从而掩盖隔离缺陷并让服务切换看起来失效。",
    goal: "把所有设计夹具迁移到 MCP 路径，并为 Designer、Spec Studio、Policy Hub 与 Integration Gateway 提供可查询、可区分的资产集。",
    nonGoal: "本次不会给普通代理开放对只读兄弟服务的写权限，也不会暴露通用管理旁路。",
    scope:
      "使用仅供种子流程使用的系统操作者、在 MCP 工具出错时快速失败、显式写入架构范围，并为每个模拟服务创建最小但可辨识的领域夹具。",
    specChanges: [
      "增加仅供种子流程使用的系统写入身份。",
      "仅在 MCP 子进程内传递种子身份。",
      "任一 MCP 工具返回错误时立即让种子流程失败。",
      "为四个应用服务写入可区分的资产集合。",
      "按应用服务维度核对数据库计数。"
    ],
    risks: ["如果种子标记泄漏到本地进程其他位置，可能扩大写权限范围。", "如果夹具不是幂等的，可能写出重复设计资产。"],
    rolloutPlan: "仅在种子子进程启用专用身份，使用稳定标识执行幂等写入，并在每次运行后核对各服务数据库计数。",
    rollbackPlan: "移除专用夹具和种子身份选择后重新执行旧版种子；由于标识稳定，现有记录可以按对应稳定标识清理。"
  },
  "proposal-bilingual-design-assets": {
    name: "双语设计资产",
    description: "为治理与设计变更资产建立完整双语内容、MCP 强制校验、迁移补齐、服务端语言切换和本地化派生视图。",
    title: "将双语设计资产作为平台规范能力落地",
    background:
      "当设计知识同时服务代理和中文使用者时，只保留单语内容会导致理解断层，而把翻译拆到外部又会破坏治理一致性与写入原子性。",
    goal: "让所有治理与设计变更相关资产以英文规范内容为基础，在同一载荷中携带完整中文覆盖，并在服务端对双语完整性进行强制校验和统一呈现。",
    nonGoal: "本提案不引入独立翻译资产体系，也不允许不同语言维护彼此分叉的独立设计事实。",
    scope:
      "包括双语资产结构落地、MCP 写入校验、历史资产迁移补齐、服务端可见的语言切换、本地化派生视图生成与双语完整性验证。",
    specChanges: [
      "为治理与设计变更资产补齐中文覆盖结构。",
      "在 MCP 写入前强制校验英文规范字段与中文覆盖字段的完整性。",
      "迁移现有资产，补全缺失的双语内容。",
      "让服务端根据语言偏好返回对应可读视图。",
      "生成面向中文使用者的本地化派生视图，同时保留英文规范事实来源。",
      "把双语完整性纳入常规治理检查。"
    ],
    risks: [
      "如果迁移阶段补齐不完整，现有资产写入可能被新的治理规则阻断。",
      "如果语言切换逻辑与治理校验不一致，用户会看到与真实持久化状态不同的内容。"
    ],
    rolloutPlan:
      "先落地双语资产结构与校验规则，再迁移历史资产补齐中文覆盖，随后开放服务端语言切换与本地化视图，并把双语验证加入常规治理流程。",
    rollbackPlan:
      "如需回退，应先关闭双语强制校验，再恢复只读取英文规范内容的视图逻辑；已补齐的中文覆盖可以保留，但不再作为阻断条件。"
  }
};

export const contextPackZhById: Record<string, ContextPackLocalizedFields> = {
  "ctx-specforge-self-design": {
    name: "SpecForge 自设计代理上下文包",
    summary: "用于维护 SpecForge 作为 MCP 原生设计中心的实施上下文，帮助代理理解平台如何管理自身设计。",
    constraints: [
      "不要在 packages/core 之外重复业务逻辑。",
      "不要通过 MCP 暴露删除类工具或原始数据库访问。",
      "不要把原始数据库错误直接返回给 MCP 客户端。",
      "所有 MCP 工具调用都必须保持可审计。"
    ],
    instructions: [
      "先阅读 SpecForge 的自设计提案。",
      "新增资产前先搜索现有设计资产，避免重复造新标识。",
      "完成新增或变更后执行治理检查。",
      "收尾前运行类型检查、测试与 MCP 冒烟验证。"
    ],
    generatedMarkdown:
      "# 代理上下文包\n\n## 功能摘要\nSpecForge 以一等设计资产的方式管理自身的 MCP 优先架构。\n\n## 业务背景\n当系统自身架构也能通过同一套 MCP 原生界面查询时，设计中心对代理会更有价值。\n\n## 目标\n- 保持 SpecForge 可自我说明。\n- 让 MCP 优先架构在 Web 与 MCP 资源中都可见。\n- 持续遵守核心服务复用与审计规则。\n\n## 约束与禁行项\n- 不要复制核心服务逻辑。\n- 默认不要暴露破坏性 MCP 工具。\n- 不要绕过工具调用审计。"
  }
};

const expectedBusinessRuleIds = [
  "rule-specforge-core-service-reuse",
  "rule-specforge-mcp-write-audit",
  "rule-specforge-seed-through-mcp",
  "rule-specforge-relationships-required",
  "rule-bilingual-asset-completeness"
] as const;

const expectedIntegrationIds = ["integration-specforge-mcp-agent"] as const;
const expectedQualityIds = ["quality-specforge-mcp-smoke", "quality-specforge-impact-ready"] as const;
const expectedObservabilityIds = ["obs-specforge-mcp-audit"] as const;
const expectedAdrIds = ["adr-mcp-first-architecture", "adr-canonical-english-localized-overlay"] as const;
const expectedProposalIds = [
  "proposal-specforge-self-design",
  "proposal-strict-application-service-isolation",
  "proposal-agent-service-workspace",
  "proposal-mcp-native-scoped-seeding",
  "proposal-bilingual-design-assets"
] as const;
const expectedContextPackIds = ["ctx-specforge-self-design"] as const;

if (Object.keys(businessRuleZhById).length !== expectedBusinessRuleIds.length) {
  throw new Error("Business-rule localization overlay count does not match expected governance assets.");
}

if (Object.keys(integrationZhById).length !== expectedIntegrationIds.length) {
  throw new Error("Integration localization overlay count does not match expected governance assets.");
}

if (Object.keys(qualityZhById).length !== expectedQualityIds.length) {
  throw new Error("Quality localization overlay count does not match expected governance assets.");
}

if (Object.keys(observabilityZhById).length !== expectedObservabilityIds.length) {
  throw new Error("Observability localization overlay count does not match expected governance assets.");
}

if (Object.keys(adrZhById).length !== expectedAdrIds.length) {
  throw new Error("ADR localization overlay count does not match expected governance assets.");
}

if (Object.keys(proposalZhById).length !== expectedProposalIds.length) {
  throw new Error("Proposal localization overlay count does not match expected governance assets.");
}

if (Object.keys(contextPackZhById).length !== expectedContextPackIds.length) {
  throw new Error("Context-pack localization overlay count does not match expected governance assets.");
}
