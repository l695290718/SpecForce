import { describe, expect, it } from "vitest";
import {
  localizeAsset,
  type Adr,
  type ApiContract,
  type Asset,
  type AssetType,
  AssetLocalizationError,
  type BusinessRule,
  type ContextPack,
  type DataModel,
  type DomainModel,
  type EventContract,
  type IntegrationContract,
  type ObservabilityDesign,
  type Proposal,
  type QualityRequirement,
  type StateMachine
} from "../index";

const now = "2026-07-13T00:00:00.000Z";

const domain: DomainModel = {
  id: "domain-billing",
  name: "Billing domain",
  description: "Handles billing workflows.",
  code: "BILLING",
  boundedContext: "Billing",
  owner: "Billing Team",
  entities: ["Invoice"],
  valueObjects: ["Money"],
  domainServices: ["InvoiceService"],
  businessCapabilities: ["Invoice issuance"],
  glossaryTerms: ["Outstanding balance"],
  createdAt: now,
  updatedAt: now,
  localizedContent: {
    zh: {
      name: "计费领域",
      description: "负责计费工作流。",
      entities: ["发票"],
      valueObjects: ["金额"],
      domainServices: ["发票服务"],
      businessCapabilities: ["发票开具"],
      glossaryTerms: ["未结余额"]
    }
  }
};

const dataModel: DataModel = {
  id: "data-invoice",
  name: "Invoice data model",
  description: "Stores invoices.",
  code: "INVOICE_DATA",
  modelType: "logical",
  domainId: "domain-billing",
  tables: ["invoices"],
  entities: ["Invoice"],
  fields: [
    {
      fieldName: "invoice_id",
      displayName: "Invoice ID",
      dataType: "uuid",
      meaning: "Unique invoice identifier.",
      nullable: false,
      constraint: "primary key",
      owner: "Billing Team"
    }
  ],
  relationships: ["Invoice belongs to customer"],
  constraints: ["invoice_id is unique"],
  dataClassification: "internal",
  lifecycle: "Hot for 90 days",
  lineage: "Billing service write model",
  createdAt: now,
  updatedAt: now,
  localizedContent: {
    zh: {
      name: "发票数据模型",
      description: "存储发票。",
      relationships: ["发票归属于客户"],
      constraints: ["invoice_id 必须唯一"],
      lifecycle: "90 天热数据",
      lineage: "计费服务写模型",
      fields: {
        invoice_id: {
          displayName: "发票编号",
          meaning: "发票唯一标识。",
          constraint: "主键"
        }
      }
    }
  }
};

const api: ApiContract = {
  id: "api-upsert-design-asset",
  name: "Upsert design asset API",
  description: "Writes design assets.",
  method: "POST",
  path: "/api/assets/upsert",
  domainId: "domain-billing",
  providerSystem: "Design Center",
  consumers: ["MCP"],
  requestSchema: { id: "string" },
  responseSchema: { id: "string" },
  errorCodes: ["INVALID_INPUT"],
  authType: "Bearer token",
  idempotency: "Uses asset id as idempotency key.",
  rateLimit: "60 rpm",
  timeout: "2s",
  compatibilityPolicy: "Additive changes only.",
  openapiSpec: "openapi: 3.1.0",
  exposure: "internal",
  createdAt: now,
  updatedAt: now,
  localizedContent: {
    zh: {
      name: "设计资产写入接口",
      description: "用于写入设计资产。",
      authType: "Bearer 令牌",
      idempotency: "使用资产标识作为幂等键。",
      rateLimit: "每分钟 60 次",
      timeout: "2 秒",
      compatibilityPolicy: "仅允许向后兼容的新增。"
    }
  }
};

const eventContract: EventContract = {
  id: "event-invoice-issued",
  name: "InvoiceIssued event",
  description: "Emitted after invoice issuance.",
  topic: "billing.invoice.issued",
  eventType: "InvoiceIssued",
  domainId: "domain-billing",
  producer: "Billing Service",
  consumers: ["Ledger Service"],
  schema: { invoiceId: "string" },
  triggerTiming: "After invoice commit",
  idempotencyKey: "invoiceId",
  orderingRequirement: "Ordered by customerId",
  retryPolicy: "Retry for 1 hour",
  deadLetterPolicy: "Route to DLQ",
  compatibilityPolicy: "No removals in v1",
  createdAt: now,
  updatedAt: now,
  localizedContent: {
    zh: {
      name: "发票开具事件",
      description: "发票开具后发出。",
      triggerTiming: "发票提交后",
      orderingRequirement: "按 customerId 排序",
      retryPolicy: "重试 1 小时",
      deadLetterPolicy: "投递到死信队列",
      compatibilityPolicy: "v1 不允许移除字段"
    }
  }
};

const businessRule: BusinessRule = {
  id: "rule-invoice-limit",
  name: "Invoice amount limit",
  description: "Reject invoices above the credit ceiling.",
  code: "INVOICE_LIMIT",
  domainId: "domain-billing",
  ruleType: "amount",
  condition: "invoice.amount <= customer.creditLimit",
  action: "Allow invoice creation.",
  exception: "Reject with CREDIT_LIMIT_EXCEEDED.",
  examples: ["A $10 invoice passes."],
  relatedAssets: [],
  severity: "high",
  createdAt: now,
  updatedAt: now,
  localizedContent: {
    zh: {
      name: "发票金额上限",
      description: "超过授信上限的发票会被拒绝。",
      condition: "invoice.amount <= customer.creditLimit",
      action: "允许创建发票。",
      exception: "返回 CREDIT_LIMIT_EXCEEDED。",
      examples: ["10 美元发票可以通过。"]
    }
  }
};

const stateMachine: StateMachine = {
  id: "sm-invoice",
  name: "Invoice lifecycle",
  description: "Tracks invoice states.",
  domainId: "domain-billing",
  states: ["DRAFT", "SENT", "PAID"],
  transitions: [
    {
      from: "DRAFT",
      to: "SENT",
      trigger: "InvoiceSent",
      condition: "invoice approved",
      action: "send invoice",
      emitsEvent: "InvoiceSent",
      idempotent: true,
      failureHandling: "Retry send"
    }
  ],
  initialState: "DRAFT",
  terminalStates: ["PAID"],
  events: ["InvoiceSent"],
  guards: ["invoice approved"],
  actions: ["send invoice"],
  createdAt: now,
  updatedAt: now,
  localizedContent: {
    zh: {
      name: "发票生命周期",
      description: "跟踪发票状态。",
      states: {
        DRAFT: "草稿",
        SENT: "已发送",
        PAID: "已支付"
      },
      events: {
        InvoiceSent: "发票已发送"
      },
      guards: ["发票已审批"],
      actions: ["发送发票"],
      transitions: {
        "DRAFT::SENT::InvoiceSent": {
          condition: "发票已审批",
          action: "发送发票",
          failureHandling: "重试发送"
        }
      }
    }
  }
};

const integration: IntegrationContract = {
  id: "integration-ledger",
  name: "Ledger sync",
  description: "Sends invoices to the ledger.",
  domainId: "domain-billing",
  sourceSystem: "Billing Service",
  targetSystem: "Ledger Service",
  protocol: "HTTPS",
  dataMapping: "invoiceId -> ledgerInvoiceId",
  errorMapping: "409 -> duplicate invoice",
  sla: "p95 < 1s",
  timeout: "1s",
  retryStrategy: "3 retries",
  fallbackStrategy: "Queue for retry",
  circuitBreaker: "Open after 50% failures",
  owner: "Billing Team",
  createdAt: now,
  updatedAt: now,
  localizedContent: {
    zh: {
      name: "总账同步",
      description: "将发票发送到总账。",
      dataMapping: "invoiceId -> ledgerInvoiceId",
      errorMapping: "409 表示重复发票",
      sla: "p95 小于 1 秒",
      timeout: "1 秒",
      retryStrategy: "重试 3 次",
      fallbackStrategy: "排队重试",
      circuitBreaker: "失败率超过 50% 时打开"
    }
  }
};

const qualityRequirement: QualityRequirement = {
  id: "quality-invoice-latency",
  name: "Invoice latency target",
  description: "Invoice writes should stay fast.",
  assetType: "api",
  assetId: "api-upsert-design-asset",
  domainId: "domain-billing",
  category: "performance",
  target: "p95 <= 200ms",
  measurement: "API histogram",
  priority: "high",
  verificationMethod: "Load test",
  createdAt: now,
  updatedAt: now,
  localizedContent: {
    zh: {
      name: "发票延迟目标",
      description: "发票写入需要保持快速。",
      target: "p95 小于等于 200 毫秒",
      measurement: "API 直方图",
      verificationMethod: "压测"
    }
  }
};

const observabilityDesign: ObservabilityDesign = {
  id: "obs-invoice",
  name: "Invoice observability",
  description: "Observes invoice delivery.",
  assetType: "api",
  assetId: "api-upsert-design-asset",
  domainId: "domain-billing",
  metrics: ["invoice.count"],
  logs: ["invoiceId"],
  traces: ["InvoiceUpsert"],
  alerts: ["Invoice errors > 5%"],
  dashboards: ["Billing dashboard"],
  runbook: "Check the queue and retry failures.",
  slo: "99% complete in 5 minutes.",
  createdAt: now,
  updatedAt: now,
  localizedContent: {
    zh: {
      name: "发票可观测性",
      description: "观察发票投递。",
      alerts: ["发票错误率大于 5%"],
      dashboards: ["计费看板"],
      runbook: "检查队列并重试失败项。",
      slo: "99% 在 5 分钟内完成。"
    }
  }
};

const adr: Adr = {
  id: "adr-canonical-assets",
  name: "Canonical English assets",
  title: "Canonical English assets",
  description: "Keeps one canonical asset payload.",
  domainId: "domain-billing",
  status: "accepted",
  context: "The system needs a single canonical payload.",
  decision: "Keep English at the top level.",
  alternatives: ["Duplicate assets per locale"],
  consequences: ["Localization merges happen at read time."],
  constraints: ["Do not translate ids."],
  relatedAssets: [],
  owner: "Architecture Board",
  createdAt: now,
  updatedAt: now,
  localizedContent: {
    zh: {
      name: "规范英文资产",
      title: "规范英文资产",
      description: "保持单一规范资产负载。",
      context: "系统需要单一规范负载。",
      decision: "将英文保留在顶层。",
      alternatives: ["为每种语言复制资产"],
      consequences: ["本地化在读取时合并。"],
      constraints: ["不要翻译标识符。"]
    }
  }
};

const proposal: Proposal = {
  id: "proposal-bilingual-assets",
  name: "Bilingual assets proposal",
  title: "Bilingual assets proposal",
  description: "Adds bilingual assets.",
  background: "Readers need English and Chinese.",
  goal: "Render both languages from one asset.",
  nonGoal: "Do not duplicate records.",
  scope: "Core localization",
  impactedAssets: [],
  specChanges: ["Add localization registry"],
  risks: ["Incorrect merges could hide fields."],
  rolloutPlan: "Ship core first.",
  rollbackPlan: "Disable localized reads.",
  status: "reviewing",
  createdAt: now,
  updatedAt: now,
  localizedContent: {
    zh: {
      name: "双语资产提案",
      title: "双语资产提案",
      description: "增加双语资产。",
      background: "读取方需要英文和中文。",
      goal: "通过单一资产渲染两种语言。",
      nonGoal: "不要复制记录。",
      scope: "核心本地化",
      specChanges: ["增加本地化注册表"],
      risks: ["错误的合并可能隐藏字段。"],
      rolloutPlan: "先交付核心。",
      rollbackPlan: "关闭本地化读取。"
    }
  }
};

const contextPack: ContextPack = {
  id: "ctx-bilingual-assets",
  name: "Bilingual assets context pack",
  proposalId: "proposal-bilingual-assets",
  targetAgent: "Codex",
  summary: "Implements bilingual assets.",
  includedAssets: [],
  constraints: ["Keep ids stable."],
  instructions: ["Implement Task 1 first."],
  generatedMarkdown: "# Context",
  createdAt: now,
  localizedContent: {
    zh: {
      name: "双语资产上下文包",
      summary: "实现双语资产。",
      constraints: ["保持标识稳定。"],
      instructions: ["先实现任务 1。"],
      generatedMarkdown: "# 上下文"
    }
  }
};

const allAssets: Array<[AssetType, Asset]> = [
  ["domain", domain],
  ["dataModel", dataModel],
  ["api", api],
  ["event", eventContract],
  ["businessRule", businessRule],
  ["stateMachine", stateMachine],
  ["integration", integration],
  ["quality", qualityRequirement],
  ["observability", observabilityDesign],
  ["adr", adr],
  ["proposal", proposal],
  ["contextPack", contextPack]
];

describe("asset localization", () => {
  it("returns canonical English content unchanged for the English locale", () => {
    const localized = localizeAsset("api", api, "en");

    expect(localized.name).toBe("Upsert design asset API");
    expect(localized.description).toBe("Writes design assets.");
    expect(localized.path).toBe("/api/assets/upsert");
  });

  it("merges the Chinese overlay into localizable API fields only", () => {
    const localized = localizeAsset("api", api, "zh");

    expect(localized.name).toBe("设计资产写入接口");
    expect(localized.description).toBe("用于写入设计资产。");
    expect(localized.authType).toBe("Bearer 令牌");
    expect(localized.path).toBe("/api/assets/upsert");
    expect(localized.method).toBe("POST");
  });

  it("rejects assets that omit the required Chinese overlay", () => {
    expect(() =>
      localizeAsset("api", {
        ...api,
        localizedContent: undefined
      }, "zh")
    ).toThrowError(
      expect.objectContaining({
        code: "ASSET_TRANSLATION_REQUIRED",
        assetType: "api",
        assetId: "api-upsert-design-asset",
        path: "localizedContent.zh"
      })
    );
  });

  it("rejects forbidden technical translation fields", () => {
    expect(() =>
      localizeAsset("api", {
        ...api,
        localizedContent: {
          zh: {
            ...api.localizedContent?.zh,
            path: "/translated"
          }
        }
      }, "zh")
    ).toThrowError(AssetLocalizationError);

    expect(() =>
      localizeAsset("api", {
        ...api,
        localizedContent: {
          zh: {
            ...api.localizedContent?.zh,
            path: "/translated"
          }
        }
      }, "zh")
    ).toThrowError(/TRANSLATION_FIELD_NOT_ALLOWED/);
  });

  it("rejects translated narrative arrays with a different length", () => {
    expect(() =>
      localizeAsset("proposal", {
        ...proposal,
        localizedContent: {
          zh: {
            ...proposal.localizedContent?.zh,
            specChanges: []
          }
        }
      }, "zh")
    ).toThrowError(/TRANSLATION_STRUCTURE_MISMATCH/);
  });

  it("matches translated data-field content by fieldName while preserving technical keys", () => {
    const localized = localizeAsset("dataModel", dataModel, "zh");

    expect(localized.fields[0]?.fieldName).toBe("invoice_id");
    expect(localized.fields[0]?.displayName).toBe("发票编号");
    expect(localized.fields[0]?.meaning).toBe("发票唯一标识。");
    expect(localized.fields[0]?.dataType).toBe("uuid");
  });

  it("matches state labels and transition narratives by stable technical keys", () => {
    const localized = localizeAsset("stateMachine", stateMachine, "zh");

    expect(localized.states).toEqual(["草稿", "已发送", "已支付"]);
    expect(localized.events).toEqual(["发票已发送"]);
    expect(localized.transitions[0]?.from).toBe("DRAFT");
    expect(localized.transitions[0]?.condition).toBe("发票已审批");
    expect(localized.transitions[0]?.failureHandling).toBe("重试发送");
  });

  it("keeps legacy proposal English overlays readable through the shared localizer", () => {
    const legacyProposal: Proposal = {
      ...proposal,
      name: "",
      title: "",
      description: "",
      background: "",
      goal: "",
      nonGoal: "",
      scope: "",
      specChanges: [],
      risks: [],
      rolloutPlan: "",
      rollbackPlan: "",
      localizedContent: {
        en: {
          name: "Legacy English proposal",
          title: "Legacy English proposal",
          description: "Legacy English description",
          background: "Legacy background",
          goal: "Legacy goal",
          nonGoal: "Legacy non-goal",
          scope: "Legacy scope",
          specChanges: ["Legacy spec change"],
          risks: ["Legacy risk"],
          rolloutPlan: "Legacy rollout",
          rollbackPlan: "Legacy rollback"
        },
        zh: proposal.localizedContent?.zh
      }
    };

    const localized = localizeAsset("proposal", legacyProposal, "en");

    expect(localized.name).toBe("Legacy English proposal");
    expect(localized.background).toBe("Legacy background");
    expect(localized.specChanges).toEqual(["Legacy spec change"]);
    expect(localized.localizedContent?.en?.title).toBe("Legacy English proposal");
  });

  it("supports every asset type through the shared registry", () => {
    for (const [assetType, asset] of allAssets) {
      expect(() => localizeAsset(assetType, asset, "zh")).not.toThrow();
    }
  });
});
