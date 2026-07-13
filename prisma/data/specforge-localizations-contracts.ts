import type {
  ApiContractLocalizedFields,
  EventContractLocalizedFields,
  StateMachineLocalizedFields
} from "@specforge/core";

export const apiZhById: Record<string, ApiContractLocalizedFields> = {
  "api-specforge-web-console": {
    name: "SpecForge Web 控制台 API 契约",
    description: "允许 Web 控制台通过共享的 Core Service 发起 Context Pack 生成请求。",
    authType: "本地 MVP 会话鉴权。",
    idempotency: "对同一提案重复生成时，种子数据场景下结果保持确定性。",
    rateLimit: "仅限本地 MVP 环境。",
    timeout: "5 秒。",
    compatibilityPolicy: "仅允许向响应中追加字段。"
  },
  "api-specforge-mcp-tools": {
    name: "SpecForge MCP 工具契约",
    description: "定义代理与 SpecForge 设计资产、持久化写入能力以及工作流交互时遵循的 MCP 工具调用边界。",
    authType: "MVP 阶段采用 allowAllPolicy；后续演进为 OAuth 或 RBAC。",
    idempotency: "读工具天然幂等；写入型 upsert 工具会被审计、校验，并可针对同一 id 安全重试。",
    rateLimit: "为 Streamable HTTP 部署预留，当前未启用。",
    timeout: "单次工具调用 10 秒。",
    compatibilityPolicy: "在一个 MVP 发布周期内，工具名与必填参数保持稳定；新增写工具只能追加。"
  },
  "api-specforge-asset-upsert": {
    name: "SpecForge 设计资产写入 MCP 契约",
    description:
      "通过 MCP 写入边界持久化领域、数据模型、API、事件、规则、状态机、集成、质量要求、可观测性设计或 ADR 资产。",
    authType: "MVP 阶段采用 allowAllPolicy；后续演进为 RBAC 的 asset:write 权限。",
    idempotency: "以 asset.id 为幂等键。",
    rateLimit: "仅限本地 MVP 环境。",
    timeout: "10 秒。",
    compatibilityPolicy: "assetType 与 asset 这两个必需信封字段保持稳定。"
  },
  "api-specforge-proposal-upsert": {
    name: "SpecForge 提案写入 MCP 契约",
    description: "持久化 MCP 原生 Proposal 载荷，并使其可继续被 Web、MCP 资源以及未来的影响分析读取。",
    authType: "MVP 阶段采用 allowAllPolicy；后续演进为 RBAC 的 proposal:write 权限。",
    idempotency: "以 proposal.id 为幂等键。",
    rateLimit: "仅限本地 MVP 环境。",
    timeout: "10 秒。",
    compatibilityPolicy: "Proposal 的 status 与 impactedAssets 仍然属于稳定契约内容。"
  },
  "api-specforge-context-pack-upsert": {
    name: "SpecForge Context Pack 写入 MCP 契约",
    description: "持久化为某个提案生成或人工整理的 Agent Context Pack。",
    authType: "MVP 阶段采用 allowAllPolicy；后续演进为 RBAC 的 context-pack:generate 权限。",
    idempotency: "以 contextPack.id 为幂等键。",
    rateLimit: "仅限本地 MVP 环境。",
    timeout: "10 秒。",
    compatibilityPolicy: "generatedMarkdown 继续作为导出所需字段保留在契约中。"
  },
  "api-specforge-asset-link": {
    name: "SpecForge 资产关系写入 MCP 契约",
    description: "持久化两个设计资产之间的类型化关系，供图谱遍历与未来影响分析使用。",
    authType: "MVP 阶段采用 allowAllPolicy；后续演进为 RBAC 的 asset:write 权限。",
    idempotency: "以 source、target 与 relationType 的组合作为幂等依据。",
    rateLimit: "仅限本地 MVP 环境。",
    timeout: "10 秒。",
    compatibilityPolicy: "relationType 字符串只能追加扩展，不得在不显式迁移的情况下改变既有语义。"
  },
  "api-specforge-graph-query": {
    name: "SpecForge 资产图谱查询契约",
    description: "以代理可读的图结构读取已持久化的设计资产以及 AssetLink 边。",
    authType: "需要 asset:read 与 graph:read 权限。",
    idempotency: "只读操作。",
    rateLimit: "仅限本地 MVP 环境。",
    timeout: "5 秒。",
    compatibilityPolicy: "节点与边都只允许追加。"
  },
  "api-specforge-ai-generation": {
    name: "SpecForge AI 生成契约",
    description: "在保留提供方抽象层的前提下，为提案、ADR、业务规则、测试建议与 Agent Context Pack 请求模拟 AI 生成。",
    authType: "本地 MVP 会话鉴权。",
    idempotency: "对同一提示词，Mock provider 生成结果保持确定性。",
    rateLimit: "仅限本地 MVP 环境。",
    timeout: "10 秒。",
    compatibilityPolicy: "新增 capability 只能以追加方式扩展。"
  }
};

export const eventZhById: Record<string, EventContractLocalizedFields> = {
  "event-specforge-context-pack-generated": {
    name: "ContextPackGenerated 事件契约",
    description: "概念上表示某个代理实施流程所需的 Context Pack 已完成生成并可被后续环节消费。",
    triggerTiming: "在 Context Pack Markdown 生成完成之后触发。",
    orderingRequirement: "按 proposalId 保持顺序。",
    retryPolicy: "通过审计流水线重试概念性的事件发布。",
    deadLetterPolicy: "MVP 阶段将发布失败记录到审计日志中。",
    compatibilityPolicy: "v1 中不移除字段。"
  },
  "event-specforge-mcp-tool-called": {
    name: "McpToolCalled 事件契约",
    description: "表示某个 MCP 客户端调用了 SpecForge 工具这一条可审计事实。",
    triggerTiming: "围绕每一次 MCP 工具调用产生。",
    orderingRequirement: "不要求严格顺序。",
    retryPolicy: "MVP 阶段至少尝试一次审计写入；持久化重试留待后续实现。",
    deadLetterPolicy: "将审计写入失败暴露为内部错误指标。",
    compatibilityPolicy: "仅允许追加字段。"
  },
  "event-specforge-design-asset-upserted": {
    name: "DesignAssetUpserted 事件契约",
    description: "表示通过 MCP 的 upsert_design_asset 工具成功持久化了一次设计资产写入。",
    triggerTiming: "在设计资产 upsert 成功之后触发。",
    orderingRequirement: "按 assetId 保持顺序。",
    retryPolicy: "若种子导入失败，可通过 MCP 重新执行幂等 upsert。",
    deadLetterPolicy: "MVP 阶段将失败记录到审计日志中。",
    compatibilityPolicy: "仅允许追加字段。"
  },
  "event-specforge-asset-link-created": {
    name: "AssetLinkCreated 事件契约",
    description: "表示两个设计资产之间的一条持久化关系已经建立。",
    triggerTiming: "在 link_assets 调用成功之后触发。",
    orderingRequirement: "不要求严格顺序。",
    retryPolicy: "同一关系写入可以安全重试。",
    deadLetterPolicy: "通过 MCP 错误结果暴露关系写入失败。",
    compatibilityPolicy: "关系载荷只允许追加扩展。"
  },
  "event-specforge-governance-check-completed": {
    name: "GovernanceCheckCompleted 事件契约",
    description: "表示针对某个资产、提案或 Context Pack 的治理评估已经完成。",
    triggerTiming: "在治理检查返回结果之后触发。",
    orderingRequirement: "为了 UI 快照展示，按目标 id 保持顺序。",
    retryPolicy: "作为读操作，可按需重复执行。",
    deadLetterPolicy: "MVP 阶段不设 DLQ，改为返回经过净化的 MCP 错误。",
    compatibilityPolicy: "仅允许追加字段。"
  }
};

export const stateMachineZhById: Record<string, StateMachineLocalizedFields> = {
  "sm-specforge-proposal-lifecycle": {
    name: "SpecForge 提案生命周期",
    description: "控制设计变更提案从草稿到实施完成的生命周期推进。",
    states: {
      draft: "草稿",
      reviewing: "评审中",
      approved: "已批准",
      implemented: "已实施",
      archived: "已归档"
    },
    events: {
      ProposalCreated: "提案已创建",
      GovernanceCheckRun: "已执行治理检查",
      ContextPackGenerated: "已生成 Context Pack"
    },
    guards: ["必填字段已补齐", "受影响资产已建立关联", "高风险提案已提供回滚方案"],
    actions: ["执行治理检查", "生成 Context Pack", "记录审计日志"],
    transitions: {
      "draft::reviewing::submit_for_review": {
        action: "执行治理检查"
      },
      "reviewing::approved::approve": {
        condition: "阻塞性的治理错误已全部解决",
        action: "将提案标记为已批准"
      },
      "approved::implemented::implementation_done": {
        action: "附加 Context Pack 与验证证据"
      },
      "implemented::archived::archive": {
        action: "从活跃工作流中隐藏"
      }
    }
  },
  "sm-specforge-context-pack-generation": {
    name: "SpecForge Context Pack 生成生命周期",
    description: "描述 Agent Context Pack 如何从提案及其受影响设计资产中生成。",
    states: {
      requested: "已请求",
      collecting_assets: "收集资产中",
      rendering_markdown: "渲染 Markdown 中",
      ready: "已就绪",
      failed: "失败"
    },
    events: {
      ContextPackGenerated: "已生成 Context Pack"
    },
    guards: ["提案存在", "纳入的资产 id 全部有效", "Do-not Rules 已就位"],
    actions: ["渲染 Markdown", "记录审计日志", "返回 MCP 文本结果"],
    transitions: {
      "requested::collecting_assets::generate_context_pack": {
        action: "加载提案及受影响资产"
      },
      "collecting_assets::rendering_markdown::assets_loaded": {
        action: "渲染各个章节"
      },
      "rendering_markdown::ready::markdown_rendered": {
        action: "返回 Markdown 或 JSON"
      },
      "rendering_markdown::failed::render_failed": {
        action: "返回经过净化的错误"
      }
    }
  }
};

if (Object.keys(apiZhById).length !== 8) {
  throw new Error("API localization overlay count does not match canonical assets.");
}

if (Object.keys(eventZhById).length !== 5) {
  throw new Error("Event localization overlay count does not match canonical assets.");
}

if (Object.keys(stateMachineZhById).length !== 2) {
  throw new Error("State-machine localization overlay count does not match canonical assets.");
}
