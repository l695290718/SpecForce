import type { DataModelLocalizedFields, DomainModelLocalizedFields } from "@specforge/core";

export const domainZhById: Record<string, DomainModelLocalizedFields> = {
  "domain-specforge-platform": {
    name: "SpecForge 平台领域",
    description: "该限界上下文负责管理 SpecForge Design Center 本身，并将其作为一个 MCP 原生的设计系统来运营。",
    entities: ["设计资产", "提案", "上下文包", "治理检查", "审计日志", "MCP 工具", "MCP 资源", "MCP 提示词"],
    valueObjects: ["资产引用", "权限", "治理严重级别", "代理目标", "Markdown 文档"],
    domainServices: ["核心设计服务", "上下文包生成器", "治理执行器", "MCP 工具注册表", "审计记录器"],
    businessCapabilities: ["MCP 原生代理接口", "设计资产管理", "治理校验", "代理上下文生成", "可自说明的设计中心"],
    glossaryTerms: ["MCP 原生", "核心服务", "代理上下文包", "禁止规则", "审计日志"]
  }
};

export const dataModelZhById: Record<string, DataModelLocalizedFields> = {
  "data-specforge-assets": {
    name: "SpecForge 设计资产数据模型",
    description: "用于存储结构化设计资产，例如领域、数据模型、API、事件、规则、状态机、ADR、提案和上下文包。",
    relationships: [
      "提案通过 impactedAssets 与设计资产形成 n..m 关系",
      "上下文包通过 includedAssets 与设计资产形成 n..m 关系"
    ],
    constraints: ["asset_id 一旦发布必须保持稳定", "payload 必须能够渲染为代理可读取的 Markdown"],
    lifecycle: "MVP 阶段设计资产先通过 git 进行版本化，后续再通过 Prisma 持久化。",
    lineage: "种子数据、Web Console 编辑，以及 MCP 写入工具",
    fields: {
      asset_id: {
        displayName: "资产 ID",
        meaning: "供 Web、MCP 资源和 MCP 工具使用的稳定标识符。",
        constraint: "主键",
        classification: "内部",
        example: "api-specforge-mcp-tools"
      },
      asset_type: {
        displayName: "资产类型",
        meaning: "用于区分资产渲染、治理、路由以及 MCP 资源暴露方式的判别字段。",
        constraint: "枚举 AssetType",
        classification: "内部",
        example: "api"
      },
      payload: {
        displayName: "载荷内容",
        meaning: "由核心服务渲染器和 MCP 资源使用的结构化资产主体。",
        constraint: "有效的 JSON 对象",
        classification: "内部",
        example: "{\"method\":\"POST\"}"
      }
    }
  },
  "data-specforge-audit": {
    name: "SpecForge 审计日志数据模型",
    description: "用于记录 MCP 工具调用以及未来的 Web/API 操作，以支持可追踪性。",
    relationships: ["AuditLog 通过 targetType 和 targetId 引用目标，而不是使用硬数据库外键"],
    constraints: ["所有 MCP 工具调用都必须生成审计日志", "数据库错误不得原样返回给 MCP 客户端"],
    lifecycle: "MVP 阶段在内存中保留审计记录；下一阶段后端切片再通过 Prisma 持久化。",
    lineage: "MCP 工具包装层以及未来的 Web/API 中间件",
    fields: {
      id: {
        displayName: "审计 ID",
        meaning: "审计日志的唯一标识。",
        constraint: "主键",
        classification: "内部",
        example: "audit-1"
      },
      actor_type: {
        displayName: "执行方类型",
        meaning: "表示本次操作来源类别。",
        constraint: "枚举 user|agent|system",
        classification: "内部",
        example: "agent"
      },
      action: {
        displayName: "操作名称",
        meaning: "已执行的工具名或操作名。",
        constraint: "非空",
        classification: "内部",
        example: "generate_context_pack"
      },
      status: {
        displayName: "执行状态",
        meaning: "表示该操作成功还是失败。",
        constraint: "枚举 success|failed",
        classification: "内部",
        example: "success"
      }
    }
  },
  "data-specforge-mcp-registry": {
    name: "SpecForge MCP 注册表数据模型",
    description: "描述面向 AI 编码代理暴露的协议原生工具、资源、资源模板和提示词。",
    relationships: ["McpTool 会写入 AuditLog", "McpResource 会读取 DesignAsset", "McpPrompt 会引用工作流工具"],
    constraints: ["工具名称在一个 MVP 发布周期内必须保持稳定", "写入类工具必须被审计", "默认不暴露删除类工具"],
    lifecycle: "MVP 阶段注册项以代码定义，后续会作为设计资产持久化，供代理发现。",
    lineage: "apps/mcp-server/src/tools.ts、resources.ts 和 prompts.ts",
    fields: {
      name: {
        displayName: "协议名称",
        meaning: "面向 MCP 的稳定标识符，用于工具、资源、模板或提示词。",
        constraint: "在同一注册类别内唯一",
        classification: "内部",
        example: "upsert_design_asset"
      },
      kind: {
        displayName: "注册类别",
        meaning: "用于区分工具、资源、资源模板和提示词。",
        constraint: "枚举 tool|resource|resource_template|prompt",
        classification: "内部",
        example: "tool"
      },
      permissions: {
        displayName: "所需权限",
        meaning: "MCP 服务器执行该操作前必须具备的权限集合。",
        constraint: "必须映射到 Permission 联合类型",
        classification: "内部",
        example: "[\"asset:write\"]"
      },
      read_only: {
        displayName: "只读提示",
        meaning: "供 MCP 注解使用，告诉代理该操作是否会修改状态。",
        constraint: "写入类工具必须为 false",
        classification: "内部",
        example: "false"
      }
    }
  },
  "data-specforge-ai-generation": {
    name: "SpecForge AI 生成数据模型",
    description: "用于记录模拟及未来真实 AI 生成请求，覆盖提案、ADR、业务规则、测试建议和代理上下文包。",
    relationships: [
      "GeneratedDraft 可以转化为 Proposal、ADR、BusinessRule 或 ContextPack",
      "AIProviderConfig 用于选择提供方行为"
    ],
    constraints: [
      "Mock provider 必须保持确定性",
      "在提供密钥前 OpenAI provider 接口保持未配置状态",
      "生成草稿在被接受前不具备权威性"
    ],
    lifecycle: "MVP 阶段请求是临时性的，待引入提供方审计历史后可再持久化。",
    lineage: "packages/core/src/ai",
    fields: {
      provider_id: {
        displayName: "提供方 ID",
        meaning: "当前选定的 AI 提供方实现。",
        constraint: "必须是已注册的提供方",
        classification: "内部",
        example: "mock"
      },
      capability: {
        displayName: "生成能力",
        meaning: "向提供方请求的草稿类型。",
        constraint: "枚举 proposal|adr|businessRule|testSuggestions|agentContextPack",
        classification: "内部",
        example: "proposal"
      },
      prompt: {
        displayName: "提示词",
        meaning: "用于生成草稿的用户或代理指令。",
        constraint: "非空",
        classification: "内部",
        example: "创建设计提案工作流"
      },
      draft_payload: {
        displayName: "草稿载荷",
        meaning: "在被接受为设计资产之前的结构化生成结果。",
        constraint: "按 capability 要求的有效 JSON",
        classification: "内部",
        example: "{\"title\":\"提案：...\"}"
      }
    }
  },
  "data-specforge-web-workspace": {
    name: "SpecForge Web 工作区数据模型",
    description: "建模 Web Console 中浏览器侧的编辑状态、草稿资产、语言偏好、筛选条件和导出动作。",
    relationships: [
      "AssetDraft 可通过 MCP 写入工具转化为 DesignAsset",
      "LocalePreference 会读取 I18nMessage",
      "MarkdownExport 会读取 ContextPack"
    ],
    constraints: ["草稿在持久化前不能成为事实来源", "缺失翻译时必须能够回退到默认语言", "导出操作不得修改设计资产"],
    lifecycle: "浏览器状态是短暂的；被接受的资产通过 MCP 写入工具持久化。",
    lineage: "apps/web 组件和应用路由",
    fields: {
      draft_key: {
        displayName: "草稿键",
        meaning: "未保存资产草稿在本地存储中的键名。",
        constraint: "specforge-draft:{assetType}:{id}",
        classification: "内部",
        example: "specforge-draft:dataModel:data-new"
      },
      locale: {
        displayName: "语言区域",
        meaning: "当前 UI 的语言偏好。",
        constraint: "枚举 zh|en",
        classification: "内部",
        example: "zh"
      },
      filter_payload: {
        displayName: "筛选载荷",
        meaning: "当前查询、领域、类型或图谱筛选状态。",
        constraint: "有效 JSON",
        classification: "内部",
        example: "{\"assetType\":\"api\"}"
      },
      export_format: {
        displayName: "导出格式",
        meaning: "用户请求下载产物时所选的格式。",
        constraint: "枚举 markdown|json",
        classification: "内部",
        example: "markdown"
      }
    }
  },
  "data-specforge-asset-graph": {
    name: "SpecForge 资产图谱数据模型",
    description: "表示用于筛选和可视化领域、资产、提案与上下文包之间关系的节点和边。",
    relationships: [
      "Proposal 会影响 AssetGraphNode",
      "ContextPack 会包含 AssetGraphNode",
      "AssetLink 会创建 AssetGraphEdge"
    ],
    constraints: [
      "持久化时边必须引用已存在的节点",
      "图谱筛选不能隐藏已选节点的详情",
      "图谱渲染必须同时支持类型筛选和领域筛选"
    ],
    lifecycle: "MVP 阶段图谱在读取时由资产和关系链接实时推导生成。",
    lineage: "packages/core/src/graph 和 apps/web/app/graph",
    fields: {
      node_id: {
        displayName: "节点 ID",
        meaning: "图节点的稳定标识，通常等于资产 ID。",
        constraint: "唯一",
        classification: "内部",
        example: "api-specforge-mcp-tools"
      },
      node_type: {
        displayName: "节点类型",
        meaning: "在图谱中被渲染和筛选的资产类型。",
        constraint: "AssetType",
        classification: "内部",
        example: "api"
      },
      edge_label: {
        displayName: "边标签",
        meaning: "表示 owns、impacts、emits 或 includes 等人类可读关系。",
        constraint: "非空",
        classification: "内部",
        example: "impacts"
      },
      domain_filter: {
        displayName: "领域筛选",
        meaning: "用于约束图谱渲染范围的可选领域标识。",
        constraint: "领域 ID",
        classification: "内部",
        example: "domain-specforge-platform"
      }
    }
  },
  "data-specforge-i18n": {
    name: "SpecForge 国际化数据模型",
    description: "描述中英文双语 UI 消息键以及缺失翻译时的回退行为。",
    relationships: ["LocalePreference 会选择 LocaleCatalog", "UI 组件会按 key 读取 I18nMessage"],
    constraints: [
      "中文和英文目录必须对同一 UI 面提供一致的键覆盖",
      "缺失翻译时必须回退到稳定的默认消息",
      "消息键一旦发布就不应频繁改名"
    ],
    lifecycle: "消息目录随代码一同演进；用户语言偏好在会话和本地存储之间同步。",
    lineage: "Web UI 文案目录、本地化覆盖以及 LocalePreference 状态",
    fields: {
      message_key: {
        displayName: "消息键",
        meaning: "供 UI 组件使用的稳定代码侧键名。",
        constraint: "在每个 locale 内唯一",
        classification: "内部",
        example: "nav.dataModels"
      },
      locale: {
        displayName: "语言区域",
        meaning: "消息所属的语言与区域分组。",
        constraint: "枚举 zh|en",
        classification: "内部",
        example: "zh"
      },
      text: {
        displayName: "翻译文本",
        meaning: "最终渲染到 UI 上的文案。",
        constraint: "非空",
        classification: "内部",
        example: "数据模型"
      },
      fallback_key: {
        displayName: "回退键",
        meaning: "当翻译缺失时可选使用的回退消息键。",
        constraint: "必须是已存在的消息键",
        classification: "内部",
        example: "asset.dataModels"
      }
    }
  }
};

if (Object.keys(domainZhById).length !== 1) {
  throw new Error("Domain localization overlay count does not match canonical assets.");
}

if (Object.keys(dataModelZhById).length !== 7) {
  throw new Error("Data-model localization overlay count does not match canonical assets.");
}
