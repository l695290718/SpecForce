import { expect, it } from "vitest";

import { reconcileDesignFacts } from "./reconcile-design-facts";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "scope" };

function manifestDecision(overrides: Record<string, unknown> = {}) {
  return {
    id: "scope",
    mcpAdrId: "adr-scope",
    proposalId: "proposal-scope",
    contextPackId: "ctx-scope",
    relatedAssetIds: [],
    evidence: [],
    scope,
    ...overrides
  };
}

function persistedAdr(overrides: Record<string, unknown> = {}) {
  return {
    id: "adr-scope",
    architectureScope: scope,
    localizedContent: {
      en: {
        name: "Scope decision",
        title: "Scope decision",
        description: "Canonical description",
        context: "Canonical context",
        decision: "Canonical decision",
        alternatives: ["Keep the baseline"],
        consequences: ["Enforce read-back validation"],
        constraints: ["Scope-safe writes only"]
      },
      zh: {
        name: "范围决策",
        title: "范围决策",
        description: "规范描述",
        context: "规范背景",
        decision: "规范决策",
        alternatives: ["保持基线"],
        consequences: ["执行回读校验"],
        constraints: ["仅允许范围安全写入"]
      }
    },
    ...overrides
  };
}

function persistedProposal(overrides: Record<string, unknown> = {}) {
  return {
    id: "proposal-scope",
    architectureScope: scope,
    localizedContent: {
      en: {
        name: "Scope proposal",
        title: "Scope proposal",
        description: "Canonical description",
        background: "Canonical background",
        goal: "Canonical goal",
        nonGoal: "Canonical non-goal",
        scope: "Canonical scope",
        specChanges: ["Canonical change"],
        risks: ["Canonical risk"],
        rolloutPlan: "Canonical rollout"
      },
      zh: {
        name: "范围提案",
        title: "范围提案",
        description: "规范描述",
        background: "规范背景",
        goal: "规范目标",
        nonGoal: "规范非目标",
        scope: "规范范围",
        specChanges: ["规范变更"],
        risks: ["规范风险"],
        rolloutPlan: "规范发布"
      }
    },
    ...overrides
  };
}

function persistedContextPack(overrides: Record<string, unknown> = {}) {
  return {
    id: "ctx-scope",
    proposalId: "proposal-scope",
    architectureScope: scope,
    localizedContent: {
      en: {
        name: "Scope Context Pack",
        summary: "Canonical summary",
        constraints: ["Keep identifiers stable"],
        instructions: ["Apply the validation rules"],
        generatedMarkdown: "# Scope Context Pack"
      },
      zh: {
        name: "范围上下文包",
        summary: "规范摘要",
        constraints: ["保持标识稳定"],
        instructions: ["应用校验规则"],
        generatedMarkdown: "# 范围上下文包"
      }
    },
    ...overrides
  };
}

it("reports a missing ADR as incomplete", async () => {
  const report = await reconcileDesignFacts({
    manifest: {
      decisions: [{
        id: "scope",
        mcpAdrId: "adr-scope",
        scope: { applicationServiceId: "com.huawei.celon.desiner", scopePath: "scope" }
      }]
    } as never,
    find: async () => undefined
  });

  expect(report.missing).toEqual(["scope"]);
  expect(report.verified).toEqual([]);
});

it("reports a missing linked proposal as incomplete", async () => {
  const report = await reconcileDesignFacts({
    manifest: { decisions: [manifestDecision()] } as never,
    find: async (type) => type === "adr" ? persistedAdr() : undefined
  });
  expect(report.missing).toEqual(["scope:proposal"]);
});

it("reports a missing typed relationship as incomplete", async () => {
  const report = await reconcileDesignFacts({
    manifest: { decisions: [manifestDecision()] } as never,
    find: async (type) => type === "evidence" ? undefined : type === "adr" ? persistedAdr() : type === "proposal" ? persistedProposal() : persistedContextPack(),
    findLinks: async () => []
  });
  expect(report.missing).toEqual(["scope:proposal-adr-link"]);
});

it("reports missing evidence as incomplete", async () => {
  const report = await reconcileDesignFacts({
    manifest: { decisions: [manifestDecision({ evidence: [{ command: "pnpm test", result: "passes" }] })] } as never,
    find: async (type) => type === "evidence" ? undefined : type === "adr" ? persistedAdr() : type === "proposal" ? persistedProposal() : persistedContextPack(),
    findLinks: async () => [
      { sourceLogicalId: "proposal-scope", targetLogicalId: "adr-scope", label: "IMPLEMENTS_DECISION" },
      { sourceLogicalId: "ctx-scope", targetLogicalId: "proposal-scope", label: "IMPLEMENTS_CONTEXT_FOR" }
    ]
  });

  expect(report.missing).toEqual(["scope:evidence"]);
});

it("reports a mismatched proposal ID", async () => {
  const report = await reconcileDesignFacts({
    manifest: { decisions: [manifestDecision()] } as never,
    find: async (type) => type === "adr" ? persistedAdr() : type === "proposal" ? persistedProposal({ id: "proposal-shadow" }) : persistedContextPack()
  });

  expect(report.mismatched).toEqual(["scope:proposal"]);
});

it("reports an out-of-scope proposal", async () => {
  const report = await reconcileDesignFacts({
    manifest: { decisions: [manifestDecision()] } as never,
    find: async (type) => type === "adr"
      ? persistedAdr()
      : type === "proposal"
        ? persistedProposal({ architectureScope: { applicationServiceId: scope.applicationServiceId, scopePath: "scope/shadow" } })
        : persistedContextPack()
  });

  expect(report.outOfScope).toEqual(["scope:proposal"]);
});

it("reports incomplete proposal localization", async () => {
  const report = await reconcileDesignFacts({
    manifest: { decisions: [manifestDecision()] } as never,
    find: async (type) => type === "adr"
      ? persistedAdr()
      : type === "proposal"
        ? persistedProposal({
          localizedContent: {
            en: {
              name: "Scope proposal",
              title: "Scope proposal",
              description: "Canonical description",
              background: "Canonical background",
              goal: "Canonical goal",
              nonGoal: "Canonical non-goal",
              scope: "Canonical scope",
              specChanges: ["Canonical change"],
              risks: ["Canonical risk"],
              rolloutPlan: "Canonical rollout"
            },
            zh: {
              name: "范围提案",
              title: "范围提案",
              description: "规范描述",
              background: "规范背景",
              goal: "",
              nonGoal: "规范非目标",
              scope: "规范范围",
              specChanges: ["规范变更"],
              risks: ["规范风险"],
              rolloutPlan: "规范发布"
            }
          }
        })
        : persistedContextPack()
  });

  expect(report.mismatched).toEqual(["scope:proposal"]);
});

it("reports a mismatched context pack ID", async () => {
  const report = await reconcileDesignFacts({
    manifest: { decisions: [manifestDecision()] } as never,
    find: async (type) => type === "adr" ? persistedAdr() : type === "proposal" ? persistedProposal() : persistedContextPack({ id: "ctx-shadow" })
  });

  expect(report.mismatched).toEqual(["scope:contextPack"]);
});

it("reports an out-of-scope context pack", async () => {
  const report = await reconcileDesignFacts({
    manifest: { decisions: [manifestDecision()] } as never,
    find: async (type) => type === "adr"
      ? persistedAdr()
      : type === "proposal"
        ? persistedProposal()
        : persistedContextPack({ architectureScope: { applicationServiceId: "com.huawei.celon.shadow", scopePath: scope.scopePath } })
  });

  expect(report.outOfScope).toEqual(["scope:contextPack"]);
});

it("reports incomplete context pack localization", async () => {
  const report = await reconcileDesignFacts({
    manifest: { decisions: [manifestDecision()] } as never,
    find: async (type) => type === "adr"
      ? persistedAdr()
      : type === "proposal"
        ? persistedProposal()
        : persistedContextPack({
          localizedContent: {
            en: {
              name: "Scope Context Pack",
              summary: "Canonical summary",
              constraints: ["Keep identifiers stable"],
              instructions: ["Apply the validation rules"],
              generatedMarkdown: "# Scope Context Pack"
            },
            zh: {
              name: "范围上下文包",
              summary: "规范摘要",
              constraints: ["保持标识稳定"],
              instructions: [],
              generatedMarkdown: "# 范围上下文包"
            }
          }
        })
  });

  expect(report.mismatched).toEqual(["scope:contextPack"]);
});
