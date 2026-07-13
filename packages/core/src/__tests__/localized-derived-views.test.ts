import { describe, expect, it } from "vitest";
import {
  analyzeProposalImpact,
  buildAssetGraph,
  generateContextPack,
  renderAssetAsMarkdown,
  renderAssetSummary,
  runGovernanceChecks,
  seedData,
  type ApiContract,
  type ContextPack,
  type DomainModel,
  type EventContract,
  type Proposal,
  type SpecForgeDataStore,
  type StateMachine
} from "../index";

function scopedCatalog(scope: "alpha" | "beta"): SpecForgeDataStore {
  const catalog = structuredClone(seedData);
  const domain = catalog.domains.find((asset) => asset.id === "domain-order") as DomainModel;
  const api = catalog.apis.find((asset) => asset.id === "api-create-refund") as ApiContract;
  const proposal = catalog.proposals.find((asset) => asset.id === "proposal-partial-refund") as Proposal;
  const event = catalog.events.find((asset) => asset.id === "event-refund-created") as EventContract;
  const stateMachine = catalog.stateMachines.find((asset) => asset.id === "sm-refund") as StateMachine;

  domain.name = `${scope} Order Domain`;
  domain.description = `${scope} canonical domain description`;
  domain.localizedContent = {
    zh: {
      name: `${scope} 订单域`,
      description: `${scope} 中文领域说明`,
      entities: [...domain.entities],
      valueObjects: [...domain.valueObjects],
      domainServices: [...domain.domainServices],
      businessCapabilities: [...domain.businessCapabilities],
      glossaryTerms: [...domain.glossaryTerms]
    }
  };

  api.name = `${scope} Create Refund API`;
  api.description = `${scope} canonical API description`;
  api.localizedContent = {
    zh: {
      name: `${scope} 创建退款接口`,
      description: `${scope} 中文接口说明`,
      authType: api.authType,
      idempotency: api.idempotency,
      rateLimit: api.rateLimit,
      timeout: api.timeout,
      compatibilityPolicy: api.compatibilityPolicy
    }
  };

  proposal.title = `${scope} Partial Refund`;
  proposal.name = proposal.title;
  proposal.description = `${scope} canonical proposal description`;
  proposal.impactedAssets = [{ type: "api", id: api.id, label: api.name }];
  proposal.localizedContent = {
    zh: {
      name: `${scope} 部分退款`,
      title: `${scope} 部分退款`,
      description: `${scope} 中文提案说明`,
      background: `${scope} 中文背景`,
      goal: `${scope} 中文目标`,
      nonGoal: `${scope} 中文非目标`,
      scope: `${scope} 中文范围`,
      specChanges: proposal.specChanges.map((_, index) => `${scope} 中文变更 ${index + 1}`),
      risks: proposal.risks.map((_, index) => `${scope} 中文风险 ${index + 1}`),
      rolloutPlan: `${scope} 中文发布计划`,
      rollbackPlan: `${scope} 中文回滚计划`
    }
  };

  event.localizedContent = {
    zh: {
      name: `${scope} 退款创建事件`,
      description: `${scope} 中文事件说明`,
      triggerTiming: "退款记录提交后",
      orderingRequirement: "按 orderId 保序",
      retryPolicy: "指数退避重试 24 小时",
      deadLetterPolicy: "重试耗尽后进入死信主题",
      compatibilityPolicy: "主版本内保持向后兼容"
    }
  };

  stateMachine.localizedContent = {
    zh: {
      name: `${scope} 退款状态机`,
      description: `${scope} 中文状态机说明`,
      states: Object.fromEntries(stateMachine.states.map((code) => [code, `${scope} ${code} 状态`])),
      events: Object.fromEntries(stateMachine.events.map((code) => [code, `${scope} ${code} 事件`])),
      guards: stateMachine.guards.map((_, index) => `${scope} 中文守卫 ${index + 1}`),
      actions: stateMachine.actions.map((_, index) => `${scope} 中文动作 ${index + 1}`),
      transitions: Object.fromEntries(stateMachine.transitions.map((transition) => [
        `${transition.from}::${transition.to}::${transition.trigger}`,
        {
          condition: transition.condition ? `${scope} 中文转换条件` : undefined,
          action: transition.action ? `${scope} 中文转换动作` : undefined,
          failureHandling: transition.failureHandling ? `${scope} 中文失败处理` : undefined
        }
      ]))
    }
  };

  catalog.domains = [domain];
  catalog.apis = [api];
  catalog.proposals = [proposal];
  catalog.dataModels = [];
  catalog.events = [event];
  catalog.businessRules = [];
  catalog.stateMachines = [stateMachine];
  catalog.integrations = [];
  catalog.qualityRequirements = [];
  catalog.observabilityDesigns = [];
  catalog.adrs = [];
  catalog.contextPacks = [];

  return catalog;
}

describe("scoped localized derived views", () => {
  it("renders summaries from the supplied catalog in either locale without changing technical values", async () => {
    const alpha = scopedCatalog("alpha");
    const beta = scopedCatalog("beta");

    const english = await renderAssetSummary("api", "api-create-refund", { catalog: alpha, locale: "en" });
    const chinese = await renderAssetSummary("api", "api-create-refund", { catalog: beta, locale: "zh" });

    expect(english).toContain("alpha Create Refund API");
    expect(english).not.toContain("beta Create Refund API");
    expect(chinese).toContain("beta 创建退款接口");
    expect(chinese).not.toContain("alpha 创建退款接口");
    expect(english).toContain("POST /api/orders/{orderId}/refunds");
    expect(chinese).toContain("POST /api/orders/{orderId}/refunds");
  });

  it("renders localized Markdown from the supplied catalog without leaking the global asset", async () => {
    const beta = scopedCatalog("beta");

    const markdown = await renderAssetAsMarkdown("api", "api-create-refund", { catalog: beta, locale: "zh" });

    expect(markdown).toContain("# beta 创建退款接口");
    expect(markdown).toContain("beta 中文接口说明");
    expect(markdown).not.toContain("CreateRefund API Contract");
    expect(markdown).toContain('"path": "/api/orders/{orderId}/refunds"');
  });

  it("builds localized graphs from the supplied catalog without cross-scope leakage", async () => {
    const alpha = scopedCatalog("alpha");
    const beta = scopedCatalog("beta");

    const english = await buildAssetGraph("domain-order", "api", { catalog: alpha, locale: "en" });
    const chinese = await buildAssetGraph("domain-order", "api", { catalog: beta, locale: "zh" });
    const englishApi = english.nodes.find((node) => node.id === "api-create-refund");
    const chineseApi = chinese.nodes.find((node) => node.id === "api-create-refund");

    expect(englishApi?.label).toBe("alpha Create Refund API");
    expect(chineseApi?.label).toBe("beta 创建退款接口");
    expect(chinese.nodes.some((node) => node.label.includes("alpha"))).toBe(false);
    expect(englishApi?.summary).toBe("POST /api/orders/{orderId}/refunds");
    expect(chineseApi?.summary).toBe("POST /api/orders/{orderId}/refunds");
    expect(chinese.edges.find((item) => item.target === "api-create-refund")?.label).toBe("provides api");
  });

  it("keeps schemas, topics, state codes, transition codes, and relation codes canonical", async () => {
    const beta = scopedCatalog("beta");
    const event = beta.events[0]!;
    const stateMachine = beta.stateMachines[0]!;
    const schemaBefore = structuredClone(event.schema);

    const eventGraph = await buildAssetGraph("domain-order", "event", { catalog: beta, locale: "zh" });
    const stateSummary = await renderAssetSummary("stateMachine", stateMachine.id, { catalog: beta, locale: "zh" });

    expect(eventGraph.nodes.find((node) => node.id === event.id)?.label).toBe("beta 退款创建事件");
    expect(eventGraph.nodes.find((node) => node.id === event.id)?.summary).toBe("order.refund.created");
    expect(eventGraph.edges.find((item) => item.target === event.id)?.label).toBe("emits event");
    expect(stateSummary).toContain("REQUESTED");
    expect(stateSummary).toContain("PROCESSING");
    expect(stateSummary).toContain("RefundCreated");
    expect(event.schema).toEqual(schemaBefore);
    expect(stateMachine.states).toEqual(["REQUESTED", "PROCESSING", "SUCCEEDED", "FAILED"]);
    expect(stateMachine.transitions[0]).toMatchObject({ from: "REQUESTED", to: "PROCESSING", trigger: "RefundCreated" });
  });

  it("localizes impact analysis while resolving assets and domains only from the supplied catalog", async () => {
    const alpha = scopedCatalog("alpha");
    const beta = scopedCatalog("beta");

    const english = await analyzeProposalImpact("proposal-partial-refund", { catalog: alpha, locale: "en" });
    const chinese = await analyzeProposalImpact("proposal-partial-refund", { catalog: beta, locale: "zh" });

    expect(english.affectedDomains).toContain("alpha Order Domain");
    expect(chinese.affectedDomains).toContain("beta 订单域");
    expect(chinese.affectedDomains).not.toContain("alpha Order Domain");
    expect(english.implementationTasks[0]).toMatch(/^Update /);
    expect(chinese.implementationTasks[0]).toMatch(/^更新/);
    expect(chinese.impactedAssets.find((ref) => ref.id === "api-create-refund")?.label).toBe("beta 创建退款接口");
    expect(chinese.impactedAssets.find((ref) => ref.id === "api-create-refund")?.id).toBe("api-create-refund");
  });

  it("generates locale-specific Context Pack copy from a supplied catalog", async () => {
    const beta = scopedCatalog("beta");

    const pack = await generateContextPack("proposal-partial-refund", { catalog: beta, locale: "zh", targetAgent: "codex" });

    expect(pack.name).toContain("beta 部分退款");
    expect(pack.generatedMarkdown).toContain("# Agent 上下文包");
    expect(pack.generatedMarkdown).toContain("beta 中文提案说明");
    expect(pack.generatedMarkdown).toContain("beta 创建退款接口");
    expect(pack.generatedMarkdown).toContain("POST /api/orders/{orderId}/refunds");
    expect(pack.includedAssets.find((ref) => ref.id === "api-create-refund")?.label).toBe("beta 创建退款接口");
    expect(pack.proposalId).toBe("proposal-partial-refund");
    expect(pack.targetAgent).toBe("codex");
  });

  it("checks proposal Context Pack presence against the supplied catalog", async () => {
    const withoutPack = scopedCatalog("alpha");
    const withPack = scopedCatalog("beta");
    withoutPack.contextPacks = [];
    withPack.contextPacks = [
      {
        id: "ctx-beta",
        name: "Beta Pack",
        proposalId: "proposal-partial-refund",
        targetAgent: "codex",
        summary: "Summary",
        includedAssets: [],
        constraints: [],
        instructions: [],
        generatedMarkdown: "# Pack",
        createdAt: "2026-07-13T00:00:00.000Z"
      } satisfies ContextPack
    ];

    const missing = await runGovernanceChecks("proposal", "proposal-partial-refund", { catalog: withoutPack, locale: "en" });
    const present = await runGovernanceChecks("proposal", "proposal-partial-refund", { catalog: withPack, locale: "zh" });
    const missingCheck = missing.find((item) => item.ruleCode === "PROPOSAL_CONTEXT_PACK");
    const presentCheck = present.find((item) => item.ruleCode === "PROPOSAL_CONTEXT_PACK");

    expect(missingCheck?.status).toBe("fail");
    expect(presentCheck?.status).toBe("pass");
    expect(presentCheck?.ruleName).not.toBe(missingCheck?.ruleName);
    expect(presentCheck?.assetId).toBe("proposal-partial-refund");
    expect(presentCheck?.ruleCode).toBe("PROPOSAL_CONTEXT_PACK");
  });
});
