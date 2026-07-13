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

const specStudioDomain = {
  ...selfDesignDomain,
  id: "domain-specstudio",
  name: "Specification Workspace",
  description: "Specification composition and review boundary.",
  localizedContent: {
    zh: {
      ...selfDesignDomain.localizedContent!.zh!,
      name: "规格工作空间",
      description: "负责规格编排、协作评审与发布准备的业务边界。"
    }
  }
};

const specStudioDocument = {
  ...selfDesignDataModels[0]!,
  id: "data-specstudio-document",
  name: "Specification Document",
  domainId: "domain-specstudio",
  description: "Versioned specification document model.",
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
  localizedContent: {
    zh: {
      ...selfDesignDataModels[0]!.localizedContent!.zh!,
      name: "规格文档",
      description: "支持版本管理的规格文档数据模型。",
      relationships: [
        "提案通过 impactedAssets 与规格文档形成多对多关系",
        "上下文包通过 includedAssets 与规格文档形成多对多关系"
      ],
      constraints: ["文档一经发布，其标识必须保持稳定", "文档载荷必须能够渲染为 Agent 可读的 Markdown"],
      lifecycle: "规格文档依次经历编排、评审和发布阶段。",
      lineage: "MCP 写入、规格评审和已批准的提案"
    }
  }
};

const policyHubDomain = {
  ...selfDesignDomain,
  id: "domain-policyhub",
  name: "Architecture Policy",
  description: "Policy authoring and enforcement boundary.",
  localizedContent: {
    zh: {
      ...selfDesignDomain.localizedContent!.zh!,
      name: "架构策略",
      description: "负责架构策略编写、评审与强制执行的业务边界。"
    }
  }
};

const policyHubScopeIsolationRule = {
  ...selfDesignBusinessRules[0]!,
  id: "rule-policyhub-scope-isolation",
  name: "Application Service Scope Isolation",
  domainId: "domain-policyhub",
  description: "Normal reads must remain inside one application service.",
  condition: "A normal design read targets one authorized application service.",
  action: "Filter every asset, dashboard count, relationship, and derived view by the selected application service.",
  exception: "Cross-service reads are allowed only through a separately authorized Agent workflow.",
  examples: [
    "The Policy Hub dashboard counts only Policy Hub assets.",
    "A Policy Hub graph never includes Designer nodes during a normal read."
  ],
  localizedContent: {
    zh: {
      ...selfDesignBusinessRules[0]!.localizedContent!.zh!,
      name: "应用服务范围隔离",
      description: "常规读取必须严格限制在单个应用服务范围内。",
      condition: "常规设计读取以一个已授权的应用服务为目标。",
      action: "所有资产、仪表盘计数、关系和派生视图都必须按当前应用服务过滤。",
      exception: "只有经过单独授权的 Agent 工作流才允许跨应用服务读取。",
      examples: ["Policy Hub 仪表盘只统计 Policy Hub 资产。", "常规读取时，Policy Hub 关系图不得包含 Designer 节点。"]
    }
  }
};

const integrationGatewayDomain = {
  ...selfDesignDomain,
  id: "domain-integrationgateway",
  name: "Integration Gateway",
  description: "External contract and event integration boundary.",
  localizedContent: {
    zh: {
      ...selfDesignDomain.localizedContent!.zh!,
      name: "集成网关",
      description: "负责外部契约发布与事件集成的业务边界。"
    }
  }
};

const integrationGatewayApi = {
  ...selfDesignApis[0]!,
  id: "api-integrationgateway-contract",
  name: "Integration Contract API",
  domainId: "domain-integrationgateway",
  description: "Publishes governed external integration contracts.",
  authType: "Service credential with contract-publish permission.",
  idempotency: "The contract id and version form the idempotency key.",
  rateLimit: "Limited per authorized publishing service.",
  timeout: "10 seconds.",
  compatibilityPolicy: "Published contract versions are immutable; compatible additions require a new version.",
  localizedContent: {
    zh: {
      ...selfDesignApis[0]!.localizedContent!.zh!,
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

const integrationGatewayEvent = {
  ...selfDesignEvents[0]!,
  id: "event-integrationgateway-contract-published",
  name: "Integration Contract Published",
  domainId: "domain-integrationgateway",
  description: "Signals publication of an integration contract.",
  triggerTiming: "After an integration contract version passes governance and is published.",
  orderingRequirement: "Events are ordered by contract id and version.",
  retryPolicy: "Retry publication with the same event id.",
  deadLetterPolicy: "Route exhausted publications to the integration contract dead-letter queue.",
  compatibilityPolicy: "Event schema changes are additive within the current major version.",
  localizedContent: {
    zh: {
      ...selfDesignEvents[0]!.localizedContent!.zh!,
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
