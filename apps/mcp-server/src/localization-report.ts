import {
  AssetLocalizationError,
  validateAssetLocalization,
  type ArchitectureScopeRef,
  type Asset,
  type AssetType,
  type AssetTypeMap
} from "@specforge/core";

export const defaultArchitectureScope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
} satisfies ArchitectureScopeRef;

export interface SeedDesignSource {
  architectureChangeProposals: AssetTypeMap["proposal"][];
  selfDesignAdrs: AssetTypeMap["adr"][];
  selfDesignApis: AssetTypeMap["api"][];
  selfDesignBusinessRules: AssetTypeMap["businessRule"][];
  selfDesignContextPack: AssetTypeMap["contextPack"];
  selfDesignDataModels: AssetTypeMap["dataModel"][];
  selfDesignDomain: AssetTypeMap["domain"];
  selfDesignEvents: AssetTypeMap["event"][];
  selfDesignIntegration: AssetTypeMap["integration"];
  selfDesignObservability: AssetTypeMap["observability"];
  selfDesignProposal: AssetTypeMap["proposal"];
  selfDesignQualityRequirements: AssetTypeMap["quality"][];
  selfDesignStateMachines: AssetTypeMap["stateMachine"][];
}

export function createSeedConfiguration(source: SeedDesignSource) {
  const {
    architectureChangeProposals,
    selfDesignAdrs,
    selfDesignApis,
    selfDesignBusinessRules,
    selfDesignContextPack,
    selfDesignDataModels,
    selfDesignDomain,
    selfDesignEvents,
    selfDesignIntegration,
    selfDesignObservability,
    selfDesignProposal,
    selfDesignQualityRequirements,
    selfDesignStateMachines
  } = source;

const designerAssetGroups = [
  ["domain", [selfDesignDomain]],
  ["dataModel", selfDesignDataModels],
  ["api", selfDesignApis],
  ["event", selfDesignEvents],
  ["businessRule", selfDesignBusinessRules],
  ["stateMachine", selfDesignStateMachines],
  ["integration", [selfDesignIntegration]],
  ["quality", selfDesignQualityRequirements],
  ["observability", [selfDesignObservability]],
  ["adr", selfDesignAdrs]
] as const;

const specStudioDomain: AssetTypeMap["domain"] = {
  ...selfDesignDomain,
  id: "domain-specstudio",
  name: "Specification Workspace",
  description: "Specification composition and review boundary.",
  code: "SPECIFICATION_WORKSPACE",
  boundedContext: "SpecificationWorkspace",
  owner: "Spec Studio Team",
  entities: ["SpecificationDocument", "SpecificationVersion", "ReviewThread"],
  valueObjects: ["DocumentId", "VersionNumber", "ReviewStatus"],
  domainServices: ["SpecificationComposer", "ReviewCoordinator", "PublicationService"],
  businessCapabilities: ["Compose specifications", "Review specifications", "Publish approved versions"],
  glossaryTerms: ["Specification Document", "Specification Version", "Review Thread"],
  localizedContent: {
    zh: {
      name: "规格工作空间",
      description: "负责规格编排、协作评审与发布准备的业务边界。",
      entities: ["规格文档", "规格版本", "评审线程"],
      valueObjects: ["文档标识", "版本号", "评审状态"],
      domainServices: ["规格编排服务", "评审协调服务", "发布服务"],
      businessCapabilities: ["编写规格", "评审规格", "发布已批准版本"],
      glossaryTerms: ["规格文档", "规格版本", "评审线程"]
    }
  }
};

const specStudioDocument: AssetTypeMap["dataModel"] = {
  ...selfDesignDataModels[0]!,
  id: "data-specstudio-document",
  name: "Specification Document",
  code: "SPECIFICATION_DOCUMENT",
  modelType: "logical",
  domainId: "domain-specstudio",
  description: "Versioned specification document model.",
  tables: ["specification_documents", "specification_versions", "review_threads"],
  entities: ["SpecificationDocument", "SpecificationVersion", "ReviewThread"],
  fields: [
    {
      fieldName: "document_id",
      displayName: "Document ID",
      dataType: "string",
      meaning: "Stable identifier of a specification document.",
      nullable: false,
      constraint: "Globally unique within the application service.",
      sensitiveLevel: "internal",
      classification: "Identifier",
      example: "spec-payment-routing",
      owner: "Spec Studio Team"
    },
    {
      fieldName: "current_version",
      displayName: "Current Version",
      dataType: "integer",
      meaning: "Latest published or reviewed version number.",
      nullable: false,
      defaultValue: "1",
      constraint: "Must increase monotonically.",
      sensitiveLevel: "none",
      classification: "Version metadata",
      example: "3",
      owner: "Spec Studio Team"
    },
    {
      fieldName: "content_markdown",
      displayName: "Specification Content",
      dataType: "text",
      meaning: "Canonical Markdown content of the specification version.",
      nullable: false,
      constraint: "Must pass specification syntax validation.",
      sensitiveLevel: "internal",
      classification: "Design content",
      example: "# Payment Routing",
      owner: "Spec Studio Team"
    },
    {
      fieldName: "review_status",
      displayName: "Review Status",
      dataType: "enum",
      meaning: "Current review state of the specification version.",
      nullable: false,
      defaultValue: "draft",
      constraint: "One of draft, reviewing, approved, or rejected.",
      sensitiveLevel: "none",
      classification: "Workflow metadata",
      example: "reviewing",
      owner: "Spec Studio Team"
    }
  ],
  relationships: [
    "Proposal n..m SpecificationDocument through impactedAssets",
    "ContextPack n..m SpecificationDocument through includedAssets"
  ],
  constraints: [
    "document id is stable once published",
    "document payload must be renderable as agent-readable Markdown"
  ],
  lifecycle: "Specification documents move from composition through review to publication.",
  lineage: "MCP writes, specification reviews, and approved proposals",
  dataClassification: "internal design specification",
  localizedContent: {
    zh: {
      name: "规格文档",
      description: "支持版本管理的规格文档数据模型。",
      relationships: [
        "提案通过 impactedAssets 与规格文档形成多对多关系",
        "上下文包通过 includedAssets 与规格文档形成多对多关系"
      ],
      constraints: ["文档一经发布，其标识必须保持稳定", "文档载荷必须能够渲染为 Agent 可读的 Markdown"],
      lifecycle: "规格文档依次经历编排、评审和发布阶段。",
      lineage: "MCP 写入、规格评审和已批准的提案",
      fields: {
        document_id: {
          displayName: "文档标识",
          meaning: "规格文档的稳定标识。",
          constraint: "在应用服务内全局唯一。",
          classification: "标识符",
          example: "spec-payment-routing"
        },
        current_version: {
          displayName: "当前版本",
          meaning: "最新发布或评审中的版本号。",
          constraint: "必须单调递增。",
          classification: "版本元数据",
          example: "3"
        },
        content_markdown: {
          displayName: "规格内容",
          meaning: "规格版本的规范 Markdown 内容。",
          constraint: "必须通过规格语法校验。",
          classification: "设计内容",
          example: "# Payment Routing"
        },
        review_status: {
          displayName: "评审状态",
          meaning: "规格版本当前所处的评审状态。",
          constraint: "取值为 draft、reviewing、approved 或 rejected。",
          classification: "流程元数据",
          example: "reviewing"
        }
      }
    }
  }
};

const policyHubDomain: AssetTypeMap["domain"] = {
  ...selfDesignDomain,
  id: "domain-policyhub",
  name: "Architecture Policy",
  description: "Policy authoring and enforcement boundary.",
  code: "ARCHITECTURE_POLICY",
  boundedContext: "ArchitecturePolicy",
  owner: "Policy Hub Team",
  entities: ["PolicyDefinition", "PolicyEvaluation", "PolicyViolation"],
  valueObjects: ["PolicyCode", "EvaluationResult", "ViolationSeverity"],
  domainServices: ["PolicyAuthoringService", "PolicyEvaluationService", "ViolationReportingService"],
  businessCapabilities: ["Author architecture policies", "Evaluate design compliance", "Report policy violations"],
  glossaryTerms: ["Policy Definition", "Policy Evaluation", "Policy Violation"],
  localizedContent: {
    zh: {
      name: "架构策略",
      description: "负责架构策略编写、评审与强制执行的业务边界。",
      entities: ["策略定义", "策略评估", "策略违规"],
      valueObjects: ["策略编码", "评估结果", "违规严重级别"],
      domainServices: ["策略编写服务", "策略评估服务", "违规报告服务"],
      businessCapabilities: ["编写架构策略", "评估设计合规性", "报告策略违规"],
      glossaryTerms: ["策略定义", "策略评估", "策略违规"]
    }
  }
};

const policyHubScopeIsolationRule: AssetTypeMap["businessRule"] = {
  ...selfDesignBusinessRules[0]!,
  id: "rule-policyhub-scope-isolation",
  name: "Application Service Scope Isolation",
  domainId: "domain-policyhub",
  description: "Normal reads must remain inside one application service.",
  code: "POLICY_SCOPE_ISOLATION",
  ruleType: "permission",
  condition: "A normal design read targets one authorized application service.",
  action: "Filter every asset, dashboard count, relationship, and derived view by the selected application service.",
  exception: "Cross-service reads are allowed only through a separately authorized Agent workflow.",
  examples: [
    "The Policy Hub dashboard counts only Policy Hub assets.",
    "A Policy Hub graph never includes Designer nodes during a normal read."
  ],
  relatedAssets: [{ type: "domain", id: "domain-policyhub", label: "Architecture Policy" }],
  severity: "high",
  localizedContent: {
    zh: {
      name: "应用服务范围隔离",
      description: "常规读取必须严格限制在单个应用服务范围内。",
      condition: "常规设计读取以一个已授权的应用服务为目标。",
      action: "所有资产、仪表盘计数、关系和派生视图都必须按当前应用服务过滤。",
      exception: "只有经过单独授权的 Agent 工作流才允许跨应用服务读取。",
      examples: ["Policy Hub 仪表盘只统计 Policy Hub 资产。", "常规读取时，Policy Hub 关系图不得包含 Designer 节点。"]
    }
  }
};

const integrationGatewayDomain: AssetTypeMap["domain"] = {
  ...selfDesignDomain,
  id: "domain-integrationgateway",
  name: "Integration Gateway",
  description: "External contract and event integration boundary.",
  code: "INTEGRATION_GATEWAY",
  boundedContext: "IntegrationGateway",
  owner: "Integration Platform Team",
  entities: ["IntegrationContract", "ContractVersion", "Publication"],
  valueObjects: ["ContractId", "SemanticVersion", "PublicationStatus"],
  domainServices: ["ContractRegistry", "ContractPublisher", "CompatibilityChecker"],
  businessCapabilities: ["Register integration contracts", "Publish contract versions", "Enforce compatibility"],
  glossaryTerms: ["Integration Contract", "Contract Version", "Publication"],
  localizedContent: {
    zh: {
      name: "集成网关",
      description: "负责外部契约发布与事件集成的业务边界。",
      entities: ["集成契约", "契约版本", "发布记录"],
      valueObjects: ["契约标识", "语义版本", "发布状态"],
      domainServices: ["契约注册服务", "契约发布服务", "兼容性检查服务"],
      businessCapabilities: ["注册集成契约", "发布契约版本", "实施兼容性约束"],
      glossaryTerms: ["集成契约", "契约版本", "发布记录"]
    }
  }
};

const integrationGatewayApi: AssetTypeMap["api"] = {
  ...selfDesignApis[0]!,
  id: "api-integrationgateway-contract",
  name: "Integration Contract API",
  domainId: "domain-integrationgateway",
  description: "Publishes governed external integration contracts.",
  method: "POST",
  path: "/integration-contracts/{contractId}/versions",
  providerSystem: "Celon Integration Gateway",
  consumers: ["Application services", "Partner integration adapters"],
  requestSchema: {
    contractId: "string",
    version: "string",
    protocol: "string",
    schema: "object"
  },
  responseSchema: {
    publicationId: "string",
    status: "published",
    publishedAt: "date-time"
  },
  errorCodes: ["CONTRACT_NOT_FOUND", "VERSION_ALREADY_EXISTS", "INCOMPATIBLE_CONTRACT", "FORBIDDEN"],
  authType: "Service credential with contract-publish permission.",
  idempotency: "The contract id and version form the idempotency key.",
  rateLimit: "Limited per authorized publishing service.",
  timeout: "10 seconds.",
  compatibilityPolicy: "Published contract versions are immutable; compatible additions require a new version.",
  openapiSpec: "openapi: 3.1.0\ninfo:\n  title: Integration Contract API\n  version: 1.0.0\npaths:\n  /integration-contracts/{contractId}/versions:\n    post: {}",
  exposure: "internal",
  localizedContent: {
    zh: {
      name: "集成契约 API",
      description: "发布经过治理校验的外部集成契约。",
      authType: "使用具备契约发布权限的服务凭证。",
      idempotency: "以契约标识与版本组合作为幂等键。",
      rateLimit: "按已授权的发布服务实施限流。",
      timeout: "十秒。",
      compatibilityPolicy: "已发布的契约版本不可变；兼容性新增需要发布新版本。"
    }
  }
};

const integrationGatewayEvent: AssetTypeMap["event"] = {
  ...selfDesignEvents[0]!,
  id: "event-integrationgateway-contract-published",
  name: "Integration Contract Published",
  domainId: "domain-integrationgateway",
  description: "Signals publication of an integration contract.",
  topic: "celon.integration.contract-published.v1",
  eventType: "IntegrationContractPublished",
  producer: "Celon Integration Gateway",
  consumers: ["Contract Catalog", "Partner Integration Adapters", "Architecture Policy Hub"],
  schema: {
    eventId: "string",
    contractId: "string",
    version: "string",
    publicationId: "string",
    publishedAt: "date-time"
  },
  triggerTiming: "After an integration contract version passes governance and is published.",
  orderingRequirement: "Events are ordered by contract id and version.",
  retryPolicy: "Retry publication with the same event id.",
  deadLetterPolicy: "Route exhausted publications to the integration contract dead-letter queue.",
  compatibilityPolicy: "Event schema changes are additive within the current major version.",
  idempotencyKey: "eventId",
  localizedContent: {
    zh: {
      name: "集成契约已发布",
      description: "表示某个集成契约版本已经完成发布。",
      triggerTiming: "集成契约版本通过治理校验并发布后触发。",
      orderingRequirement: "按契约标识和版本保持事件顺序。",
      retryPolicy: "使用相同事件标识重试发布。",
      deadLetterPolicy: "重试耗尽后转入集成契约死信队列。",
      compatibilityPolicy: "当前主版本内的事件结构只允许兼容性新增。"
    }
  }
};

const mockServiceSeeds = [
  {
    scope: serviceScope("com.huawei.celon.specstudio"),
    domain: specStudioDomain,
    assets: [["dataModel", specStudioDocument]]
  },
  {
    scope: serviceScope("com.huawei.celon.policyhub"),
    domain: policyHubDomain,
    assets: [["businessRule", policyHubScopeIsolationRule]]
  },
  {
    scope: serviceScope("com.huawei.celon.integrationgateway"),
    domain: integrationGatewayDomain,
    assets: [
      ["api", integrationGatewayApi],
      ["event", integrationGatewayEvent]
    ]
  }
] as const;

  return {
    architectureChangeProposals,
    designerAssetGroups,
    mockServiceSeeds,
    selfDesignContextPack,
    selfDesignProposal
  };
}

export type SeedConfiguration = ReturnType<typeof createSeedConfiguration>;

export interface SeedAssetInventoryEntry {
  applicationServiceId: string;
  assetType: AssetType;
  asset: Asset;
}

export interface SeedLocalizationReport {
  totalAssets: number;
  countsByApplicationService: Record<string, Partial<Record<AssetType, number>>>;
}

const assetTypeOrder: AssetType[] = [
  "domain",
  "dataModel",
  "api",
  "event",
  "businessRule",
  "stateMachine",
  "integration",
  "quality",
  "observability",
  "adr",
  "proposal",
  "contextPack"
];

export function buildSeedAssetInventory(configuration: SeedConfiguration): SeedAssetInventoryEntry[] {
  const {
    architectureChangeProposals,
    designerAssetGroups,
    mockServiceSeeds,
    selfDesignContextPack,
    selfDesignProposal
  } = configuration;
  const inventory: SeedAssetInventoryEntry[] = [];

  for (const [assetType, assets] of designerAssetGroups) {
    for (const asset of assets) {
      inventory.push({ applicationServiceId: defaultArchitectureScope.applicationServiceId, assetType, asset });
    }
  }

  for (const asset of [selfDesignProposal, ...architectureChangeProposals]) {
    inventory.push({
      applicationServiceId: defaultArchitectureScope.applicationServiceId,
      assetType: "proposal",
      asset
    });
  }

  inventory.push({
    applicationServiceId: defaultArchitectureScope.applicationServiceId,
    assetType: "contextPack",
    asset: selfDesignContextPack
  });

  for (const service of mockServiceSeeds) {
    inventory.push({
      applicationServiceId: service.scope.applicationServiceId,
      assetType: "domain",
      asset: service.domain
    });
    for (const [assetType, asset] of service.assets) {
      inventory.push({ applicationServiceId: service.scope.applicationServiceId, assetType, asset });
    }
  }

  return inventory;
}

export function validateSeedLocalizationInventory(inventory: SeedAssetInventoryEntry[]): SeedLocalizationReport {
  for (const entry of inventory) {
    try {
      validateAssetLocalization(entry.assetType, entry.asset);
    } catch (error) {
      if (error instanceof AssetLocalizationError) {
        throw new Error(
          `Seed localization invalid: applicationServiceId=${entry.applicationServiceId} type=${entry.assetType} id=${entry.asset.id} code=${error.code} path=${error.path}`
        );
      }
      throw error;
    }
  }

  const countsByApplicationService: SeedLocalizationReport["countsByApplicationService"] = {};
  const applicationServiceIds = [...new Set(inventory.map((entry) => entry.applicationServiceId))].sort();

  for (const applicationServiceId of applicationServiceIds) {
    const counts: Partial<Record<AssetType, number>> = {};
    for (const assetType of assetTypeOrder) {
      const count = inventory.filter(
        (entry) => entry.applicationServiceId === applicationServiceId && entry.assetType === assetType
      ).length;
      if (count > 0) {
        counts[assetType] = count;
      }
    }
    countsByApplicationService[applicationServiceId] = counts;
  }

  return { totalAssets: inventory.length, countsByApplicationService };
}

function serviceScope(applicationServiceId: string): ArchitectureScopeRef {
  return {
    applicationServiceId,
    scopePath: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/${applicationServiceId}`
  };
}
