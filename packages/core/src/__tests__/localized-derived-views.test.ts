import { describe, expect, it } from "vitest";
import {
  analyzeProposalImpact,
  buildAssetGraph,
  generateContextPack,
  renderAssetAsMarkdown,
  renderAssetSummary,
  runGovernanceChecks,
  searchDesignAssets,
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
  const applicationServiceId = `com.example.${scope}`;
  const architectureScope = { applicationServiceId, scopePath: `/family/product/${applicationServiceId}` };

  domain.architectureScope = architectureScope;
  api.architectureScope = architectureScope;
  proposal.architectureScope = architectureScope;
  event.architectureScope = architectureScope;
  stateMachine.architectureScope = architectureScope;

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
  api.description = `${scope} canonicalmarker API description`;
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

function mixedScopeCatalog(): SpecForgeDataStore {
  const alpha = scopedCatalog("alpha");
  const beta = scopedCatalog("beta");
  return {
    domains: [...alpha.domains, ...beta.domains],
    dataModels: [],
    apis: [...alpha.apis, ...beta.apis],
    events: [...alpha.events, ...beta.events],
    businessRules: [],
    stateMachines: [...alpha.stateMachines, ...beta.stateMachines],
    integrations: [],
    qualityRequirements: [],
    observabilityDesigns: [],
    adrs: [],
    proposals: [...alpha.proposals, ...beta.proposals],
    contextPacks: []
  };
}

function policyCacheCatalog(): SpecForgeDataStore {
  const catalog = scopedCatalog("beta");
  const api = catalog.apis[0]!;
  const proposal = catalog.proposals[0]!;

  api.id = "api-evaluate-policy";
  api.name = "Evaluate Policy API";
  api.description = "Evaluates an application policy with cache-aware lookup.";
  api.path = "/api/v1/policies/evaluate";
  api.requestSchema = { subjectId: "string", policyCode: "string" };
  api.responseSchema = { decision: "ALLOW | DENY", cacheHit: "boolean" };
  api.localizedContent!.zh!.name = "策略评估接口";
  api.localizedContent!.zh!.description = "通过缓存感知查询评估应用策略。";

  proposal.id = "proposal-policy-cache";
  proposal.name = "Add Policy Evaluation Cache";
  proposal.title = "Add Policy Evaluation Cache";
  proposal.description = "Introduce bounded caching for policy evaluations.";
  proposal.background = "Repeated evaluations currently call the policy engine every time.";
  proposal.goal = "Reduce evaluation latency without changing decisions.";
  proposal.nonGoal = "Do not change policy semantics.";
  proposal.scope = "Policy evaluation read path.";
  proposal.specChanges = ["Add a bounded cache adapter", "Invalidate cache entries when a policy version changes"];
  proposal.risks = ["Stale entries could delay policy updates"];
  proposal.rolloutPlan = "Enable by tenant cohort and observe cache hit rate.";
  proposal.rollbackPlan = "Disable the cache feature flag.";
  proposal.impactedAssets = [{ type: "api", id: api.id, label: api.name }];
  proposal.localizedContent = {
    zh: {
      name: "增加策略评估缓存",
      title: "增加策略评估缓存",
      description: "为策略评估引入有界缓存。",
      background: "重复评估当前每次都会调用策略引擎。",
      goal: "在不改变决策的前提下降低评估延迟。",
      nonGoal: "不改变策略语义。",
      scope: "策略评估读取链路。",
      specChanges: ["增加有界缓存适配器", "策略版本变化时失效缓存条目"],
      risks: ["陈旧条目可能延迟策略更新"],
      rolloutPlan: "按租户批次启用并观察缓存命中率。",
      rollbackPlan: "关闭缓存特性开关。"
    }
  };

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

  it("assigns unique scoped graph identities to duplicate logical IDs and keeps links in scope", async () => {
    const graph = await buildAssetGraph("domain-order", "api", { catalog: mixedScopeCatalog(), locale: "en" });
    const apiNodes = graph.nodes.filter((node) => node.logicalId === "api-create-refund");
    const domainNodes = graph.nodes.filter((node) => node.logicalId === "domain-order");

    expect(apiNodes).toHaveLength(2);
    expect(domainNodes).toHaveLength(2);
    expect(new Set(apiNodes.map((node) => node.id)).size).toBe(2);
    expect(apiNodes.map((node) => node.applicationServiceId).sort()).toEqual(["com.example.alpha", "com.example.beta"]);

    for (const apiNode of apiNodes) {
      const owningEdge = graph.edges.find((edge) => edge.target === apiNode.id && edge.label === "provides api");
      const domainNode = graph.nodes.find((node) => node.id === owningEdge?.source);
      expect(owningEdge?.applicationServiceId).toBe(apiNode.applicationServiceId);
      expect(domainNode?.applicationServiceId).toBe(apiNode.applicationServiceId);
      expect(owningEdge?.sourceLogicalId).toBe("domain-order");
      expect(owningEdge?.targetLogicalId).toBe("api-create-refund");
    }
  });

  it.each([
    ["different application service", "com.example.beta", "/family/product/com.example.beta"],
    ["different scope path", "com.example.alpha", "/family/product/com.example.alpha/other"]
  ])("does not resolve a scoped relation to the sole same-ID target in %s", async (_case, applicationServiceId, scopePath) => {
    const alpha = scopedCatalog("alpha");
    const beta = scopedCatalog("beta");
    const sourceProposal = alpha.proposals[0]!;
    const crossScopeApi = beta.apis[0]!;
    crossScopeApi.architectureScope = { applicationServiceId, scopePath };
    const catalog: SpecForgeDataStore = {
      domains: [...alpha.domains, ...beta.domains],
      dataModels: [],
      apis: [crossScopeApi],
      events: [],
      businessRules: [],
      stateMachines: [],
      integrations: [],
      qualityRequirements: [],
      observabilityDesigns: [],
      adrs: [],
      proposals: [sourceProposal],
      contextPacks: []
    };

    const graph = await buildAssetGraph(undefined, undefined, { catalog, locale: "en" });
    const sourceNode = graph.nodes.find((node) => node.logicalId === sourceProposal.id);
    const targetNode = graph.nodes.find((node) => node.logicalId === crossScopeApi.id);
    const crossScopeEdge = graph.edges.find((edge) => edge.source === sourceNode?.id && edge.target === targetNode?.id && edge.label === "impacts");

    expect(sourceNode?.applicationServiceId).toBe("com.example.alpha");
    expect(targetNode?.architectureScope).toEqual({ applicationServiceId, scopePath });
    expect(crossScopeEdge).toBeUndefined();
  });

  it("indexes canonical English and Chinese overlay before localizing search results", async () => {
    const beta = scopedCatalog("beta");

    const englishDisplay = await searchDesignAssets({ query: "创建退款", assetTypes: ["api"] }, { catalog: beta, locale: "en" });
    const chineseDisplay = await searchDesignAssets({ query: "canonicalmarker", assetTypes: ["api"] }, { catalog: beta, locale: "zh" });

    expect(englishDisplay.results[0]?.name).toBe("beta Create Refund API");
    expect(englishDisplay.results[0]?.relevanceReason).toContain("Matched");
    expect(chineseDisplay.results[0]?.name).toBe("beta 创建退款接口");
    expect(chineseDisplay.results[0]?.relevanceReason).toContain("匹配");
    expect(chineseDisplay.results[0]?.relevanceReason).not.toContain("Matched");
  });

  it("never falls back to the global seed for an explicit incomplete catalog", async () => {
    const incomplete = scopedCatalog("beta");
    incomplete.apis[0]!.localizedContent = undefined;

    await expect(renderAssetSummary("api", "api-create-refund", { catalog: incomplete, locale: "zh" }))
      .rejects.toMatchObject({ code: "ASSET_TRANSLATION_REQUIRED", path: "localizedContent.zh" });
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
    expect(english.implementationTasks[0]).toMatch(/^Implement proposal specification change:/);
    expect(chinese.implementationTasks[0]).toMatch(/^实施提案规格变更：/);
    expect(chinese.impactedAssets.find((ref) => ref.id === "api-create-refund")?.label).toBe("beta 创建退款接口");
    expect(chinese.impactedAssets.find((ref) => ref.id === "api-create-refund")?.id).toBe("api-create-refund");
  });

  it("derives non-refund implementation tasks from the selected proposal in English and Chinese", async () => {
    const catalog = policyCacheCatalog();

    const english = await analyzeProposalImpact("proposal-policy-cache", { catalog, locale: "en" });
    const chinese = await analyzeProposalImpact("proposal-policy-cache", { catalog, locale: "zh" });

    expect(english.implementationTasks.join("\n")).toContain("Add a bounded cache adapter");
    expect(english.implementationTasks.join("\n")).toContain("Enable by tenant cohort");
    expect(english.implementationTasks.join("\n")).toContain("Evaluate Policy API");
    expect(chinese.implementationTasks.join("\n")).toContain("增加有界缓存适配器");
    expect(chinese.implementationTasks.join("\n")).toContain("按租户批次启用");
    expect(chinese.implementationTasks.join("\n")).toContain("策略评估接口");
    expect(english.implementationTasks.join("\n")).not.toMatch(/refund|order|inventory/i);
    expect(chinese.implementationTasks.join("\n")).not.toContain("退款");
    expect(english.proposalId).toBe("proposal-policy-cache");
    expect(english.impactedAssets[0]).toMatchObject({ type: "api", id: "api-evaluate-policy" });
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

  it("returns English canonical and Chinese Context Pack views with identical technical identity", async () => {
    const beta = scopedCatalog("beta");

    const english = await generateContextPack("proposal-partial-refund", { catalog: beta, locale: "en" });
    const chinese = await generateContextPack("proposal-partial-refund", { catalog: beta, locale: "zh" });

    expect(english.name).toContain("beta Partial Refund");
    expect(english.generatedMarkdown).toContain("# Agent Context Pack");
    expect(english.localizedContent?.zh?.generatedMarkdown).toContain("# Agent 上下文包");
    expect(chinese.name).toContain("beta 部分退款");
    expect(chinese.generatedMarkdown).toContain("# Agent 上下文包");
    expect(chinese.id).toBe(english.id);
    expect(chinese.proposalId).toBe(english.proposalId);
    expect(chinese.includedAssets.map(({ type, id }) => ({ type, id }))).toEqual(
      english.includedAssets.map(({ type, id }) => ({ type, id }))
    );
    expect(chinese.generatedMarkdown).toContain("POST /api/orders/{orderId}/refunds");
  });

  it("generates proposal-derived generic Context Pack tasks and tests for a non-refund proposal", async () => {
    const catalog = policyCacheCatalog();

    const english = await generateContextPack("proposal-policy-cache", { catalog, locale: "en" });
    const chinese = await generateContextPack("proposal-policy-cache", { catalog, locale: "zh" });
    const allEnglishCopy = [english.instructions.join("\n"), english.generatedMarkdown].join("\n");
    const allChineseCopy = [chinese.instructions.join("\n"), chinese.generatedMarkdown].join("\n");

    expect(allEnglishCopy).toContain("Add a bounded cache adapter");
    expect(allEnglishCopy).toContain("contract tests for Evaluate Policy API");
    expect(allChineseCopy).toContain("增加有界缓存适配器");
    expect(allChineseCopy).toContain("为策略评估接口增加契约测试");
    expect(allEnglishCopy).not.toMatch(/refund|order domain|inventory domain/i);
    expect(allChineseCopy).not.toContain("退款");
    expect(english.proposalId).toBe("proposal-policy-cache");
    expect(chinese.proposalId).toBe("proposal-policy-cache");
    expect(english.includedAssets[0]).toMatchObject({ type: "api", id: "api-evaluate-policy" });
    expect(chinese.includedAssets[0]).toMatchObject({ type: "api", id: "api-evaluate-policy" });
    expect(english.generatedMarkdown).toContain("POST /api/v1/policies/evaluate");
    expect(chinese.generatedMarkdown).toContain("POST /api/v1/policies/evaluate");
  });

  it("localizes governance reason and suggestion for representative contract types", async () => {
    const beta = scopedCatalog("beta");

    const apiEnglish = await runGovernanceChecks("api", "api-create-refund", { catalog: beta, locale: "en" });
    const apiChinese = await runGovernanceChecks("api", "api-create-refund", { catalog: beta, locale: "zh" });
    const eventEnglish = await runGovernanceChecks("event", "event-refund-created", { catalog: beta, locale: "en" });
    const eventChinese = await runGovernanceChecks("event", "event-refund-created", { catalog: beta, locale: "zh" });

    for (const [english, chinese] of [
      [apiEnglish.find((item) => item.ruleCode === "API_IDEMPOTENCY"), apiChinese.find((item) => item.ruleCode === "API_IDEMPOTENCY")],
      [eventEnglish.find((item) => item.ruleCode === "EVENT_ENVELOPE"), eventChinese.find((item) => item.ruleCode === "EVENT_ENVELOPE")]
    ]) {
      expect(chinese?.reason).not.toBe(english?.reason);
      expect(chinese?.suggestion).not.toBe(english?.suggestion);
      expect(chinese?.ruleCode).toBe(english?.ruleCode);
      expect(chinese?.assetId).toBe(english?.assetId);
    }
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
