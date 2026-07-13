import { describe, expect, it } from "vitest";
import {
  localizeAsset,
  type Adr,
  type ApiContract,
  type Asset,
  type AssetLocalizedContentMap,
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
      name: "zh billing domain",
      description: "zh billing workflow description",
      entities: ["zh invoice"],
      valueObjects: ["zh money"],
      domainServices: ["zh invoice service"],
      businessCapabilities: ["zh invoice issuance"],
      glossaryTerms: ["zh outstanding balance"]
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
      name: "zh invoice data model",
      description: "zh stores invoices",
      relationships: ["zh invoice belongs to customer"],
      constraints: ["zh invoice id unique"],
      lifecycle: "zh hot for 90 days",
      lineage: "zh billing service write model",
      fields: {
        invoice_id: {
          displayName: "zh invoice id",
          meaning: "zh unique invoice identifier",
          constraint: "zh primary key"
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
      name: "zh design asset write api",
      description: "zh writes design assets",
      authType: "zh bearer token",
      idempotency: "zh uses asset id as idempotency key",
      rateLimit: "zh 60 rpm",
      timeout: "zh 2 seconds",
      compatibilityPolicy: "zh additive changes only"
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
      name: "zh invoice issued event",
      description: "zh emitted after invoice issuance",
      triggerTiming: "zh after invoice commit",
      orderingRequirement: "zh ordered by customerId",
      retryPolicy: "zh retry for 1 hour",
      deadLetterPolicy: "zh route to dlq",
      compatibilityPolicy: "zh no removals in v1"
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
      name: "zh invoice amount limit",
      description: "zh reject invoices above the credit ceiling",
      condition: "zh invoice.amount <= customer.creditLimit",
      action: "zh allow invoice creation",
      exception: "zh reject with CREDIT_LIMIT_EXCEEDED",
      examples: ["zh ten dollar invoice passes"]
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
      name: "zh invoice lifecycle",
      description: "zh tracks invoice states",
      states: {
        DRAFT: "zh draft",
        SENT: "zh sent",
        PAID: "zh paid"
      },
      events: {
        InvoiceSent: "zh invoice sent"
      },
      guards: ["zh invoice approved"],
      actions: ["zh send invoice"],
      transitions: {
        "DRAFT::SENT::InvoiceSent": {
          condition: "zh invoice approved",
          action: "zh send invoice",
          failureHandling: "zh retry send"
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
      name: "zh ledger sync",
      description: "zh sends invoices to the ledger",
      dataMapping: "zh invoiceId maps to ledgerInvoiceId",
      errorMapping: "zh 409 means duplicate invoice",
      sla: "zh p95 less than 1s",
      timeout: "zh 1s",
      retryStrategy: "zh 3 retries",
      fallbackStrategy: "zh queue for retry",
      circuitBreaker: "zh open after 50 percent failures"
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
      name: "zh invoice latency target",
      description: "zh invoice writes should stay fast",
      target: "zh p95 less than or equal to 200ms",
      measurement: "zh api histogram",
      verificationMethod: "zh load test"
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
      name: "zh invoice observability",
      description: "zh observes invoice delivery",
      alerts: ["zh invoice errors greater than 5 percent"],
      dashboards: ["zh billing dashboard"],
      runbook: "zh check queue and retry failures",
      slo: "zh 99 percent complete in 5 minutes"
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
      name: "zh canonical english assets",
      title: "zh canonical english assets",
      description: "zh keep one canonical payload",
      context: "zh single canonical payload is required",
      decision: "zh keep english at the top level",
      alternatives: ["zh duplicate assets per locale"],
      consequences: ["zh localization merges at read time"],
      constraints: ["zh do not translate ids"]
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
      name: "zh bilingual assets proposal",
      title: "zh bilingual assets proposal",
      description: "zh adds bilingual assets",
      background: "zh readers need english and chinese",
      goal: "zh render both languages from one asset",
      nonGoal: "zh do not duplicate records",
      scope: "zh core localization",
      specChanges: ["zh add localization registry"],
      risks: ["zh incorrect merges could hide fields"],
      rolloutPlan: "zh ship core first",
      rollbackPlan: "zh disable localized reads"
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
      name: "zh bilingual assets context pack",
      summary: "zh implements bilingual assets",
      constraints: ["zh keep ids stable"],
      instructions: ["zh implement task 1 first"],
      generatedMarkdown: "# zh context"
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

    expect(localized.name).toBe("zh design asset write api");
    expect(localized.description).toBe("zh writes design assets");
    expect(localized.authType).toBe("zh bearer token");
    expect(localized.path).toBe("/api/assets/upsert");
    expect(localized.method).toBe("POST");
  });

  it("rejects assets that omit the required Chinese overlay", () => {
    expect(() =>
      localizeAsset("api", { ...api, localizedContent: undefined }, "zh")
    ).toThrowError(
      expect.objectContaining({
        code: "ASSET_TRANSLATION_REQUIRED",
        assetType: "api",
        assetId: "api-upsert-design-asset",
        path: "localizedContent.zh"
      })
    );
  });

  it("rejects known technical-field translation attempts with a technical-mutation code", () => {
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
    ).toThrowError(/TRANSLATION_TECHNICAL_FIELD_MUTATION/);
  });

  it("keeps unknown overlay keys on the generic invalid-field code path", () => {
    expect(() =>
      localizeAsset("api", {
        ...api,
        localizedContent: {
          zh: {
            ...api.localizedContent?.zh,
            unexpectedNarrative: "not in the registry"
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
    expect(localized.fields[0]?.displayName).toBe("zh invoice id");
    expect(localized.fields[0]?.meaning).toBe("zh unique invoice identifier");
    expect(localized.fields[0]?.dataType).toBe("uuid");
  });

  it("preserves canonical state and event identifiers while keeping translated labels as metadata", () => {
    const localized = localizeAsset("stateMachine", stateMachine, "zh");

    expect(localized.states).toEqual(["DRAFT", "SENT", "PAID"]);
    expect(localized.events).toEqual(["InvoiceSent"]);
    expect(localized.initialState).toBe("DRAFT");
    expect(localized.terminalStates).toEqual(["PAID"]);
    expect(localized.transitions[0]?.from).toBe("DRAFT");
    expect(localized.transitions[0]?.to).toBe("SENT");
    expect(localized.transitions[0]?.trigger).toBe("InvoiceSent");
    expect(localized.transitions[0]?.emitsEvent).toBe("InvoiceSent");
    expect(localized.transitions[0]?.condition).toBe("zh invoice approved");
    expect(localized.transitions[0]?.failureHandling).toBe("zh retry send");
    expect(localized.localizedContent?.zh.states.DRAFT).toBe("zh draft");
    expect(localized.localizedContent?.zh.events.InvoiceSent).toBe("zh invoice sent");
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

  it("exposes typed localized overlays for later consumers", () => {
    const overlayMap: AssetLocalizedContentMap = {
      stateMachine: stateMachine.localizedContent!,
      api: api.localizedContent!,
      proposal: proposal.localizedContent!
    };

    expect(overlayMap.stateMachine.zh.states.DRAFT).toBe("zh draft");
    expect(overlayMap.api.zh.name).toBe("zh design asset write api");
    expect(overlayMap.proposal.zh.title).toBe("zh bilingual assets proposal");
  });
});
