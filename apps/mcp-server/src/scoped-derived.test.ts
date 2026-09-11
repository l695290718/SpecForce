import { seedData, scopeById, validateAssetLocalization } from "@specforge/core";
import type { ArchitectureScopeRef, ContextPack, DomainModel, FunctionalFeature, Proposal, ServiceFeature } from "@specforge/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => ({
  listPersistedAssetLinks: vi.fn(),
  listPersistedAssets: vi.fn(),
  listPersistedContextPacks: vi.fn(),
  listPersistedProposals: vi.fn(),
  getPersistedAsset: vi.fn(),
  renderPersistedAssetAsMarkdown: vi.fn(),
  upsertContextPack: vi.fn()
}));

vi.mock("./persistence", () => persistence);

import {
  analyzeScopedProposalImpact,
  buildScopedAssetGraph,
  generateScopedContextPack,
  loadScopedAssetCatalog,
  renderScopedAssetMarkdown,
  renderScopedCollectionMarkdown,
  runScopedGovernanceChecks
} from "./scoped-derived";

const designerId = "com.huawei.celon.desiner";
const policyId = "com.huawei.celon.policyhub";

function scope(applicationServiceId: string): ArchitectureScopeRef {
  const value = scopeById(applicationServiceId);
  if (!value) throw new Error(`Missing test scope ${applicationServiceId}`);
  return { applicationServiceId, scopePath: value.scopePath };
}

function localizedDomain(applicationServiceId: string, englishName: string, chineseName: string): DomainModel {
  const base = structuredClone(seedData.domains[0]!) as DomainModel;
  return {
    ...base,
    id: "shared-domain",
    name: englishName,
    description: `${englishName} canonical description`,
    architectureScope: scope(applicationServiceId),
    localizedContent: {
      zh: {
        name: chineseName,
        description: `${chineseName}中文说明`,
        entities: base.entities.map((item) => `${item}中文`),
        valueObjects: base.valueObjects.map((item) => `${item}中文`),
        domainServices: base.domainServices.map((item) => `${item}中文`),
        businessCapabilities: base.businessCapabilities.map((item) => `${item}中文`),
        glossaryTerms: base.glossaryTerms.map((item) => `${item}中文`)
      }
    }
  };
}

function localizedProposal(applicationServiceId: string, englishTitle: string, chineseTitle: string): Proposal {
  const base = structuredClone(seedData.proposals[0]!) as Proposal;
  return {
    ...base,
    id: "shared-proposal",
    name: englishTitle,
    title: englishTitle,
    description: `${englishTitle} canonical description`,
    impactedAssets: [{ type: "domain", id: "shared-domain", label: "canonical domain label" }],
    architectureScope: scope(applicationServiceId),
    localizedContent: {
      zh: {
        name: chineseTitle,
        title: chineseTitle,
        description: `${chineseTitle}中文说明`,
        background: `${chineseTitle}背景`,
        goal: `${chineseTitle}目标`,
        nonGoal: `${chineseTitle}非目标`,
        scope: `${chineseTitle}范围`,
        specChanges: base.specChanges.map((item) => `${item}中文`),
        risks: base.risks.map((item) => `${item}中文`),
        rolloutPlan: `${chineseTitle}发布计划`,
        rollbackPlan: `${chineseTitle}回滚计划`
      }
    }
  };
}

function localizedContextPack(applicationServiceId: string, englishName: string, chineseName: string): ContextPack {
  return {
    id: "shared-context-pack",
    name: englishName,
    proposalId: "shared-proposal",
    targetAgent: "codex",
    summary: `${englishName} canonical summary`,
    includedAssets: [{ type: "domain", id: "shared-domain", label: `${englishName} domain` }],
    constraints: ["Canonical constraint"],
    instructions: ["Canonical instruction"],
    generatedMarkdown: `# ${englishName}`,
    createdAt: "2026-07-13T00:00:00.000Z",
    architectureScope: scope(applicationServiceId),
    localizedContent: {
      zh: {
        name: chineseName,
        summary: `${chineseName}中文摘要`,
        constraints: ["中文约束"],
        instructions: ["中文指令"],
        generatedMarkdown: `# ${chineseName}`
      }
    }
  };
}

function localizedServiceFeature(applicationServiceId: string): ServiceFeature {
  return {
    id: "sf-governed-authoring",
    name: "Governed design authoring",
    description: "Authors governed design facts in the exact application-service Scope.",
    lifecycleStatus: "ACTIVE",
    tags: ["governance"],
    actors: ["Architect"],
    scenario: "An architect records a design decision.",
    valueOutcome: "Design facts remain queryable and scope-safe.",
    benefitHypothesis: "Governance reduces design drift.",
    serviceBoundary: ["Does not write another application-service Scope."],
    acceptanceCriteria: ["Writes retain exact Scope."],
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
    architectureScope: scope(applicationServiceId),
    localizedContent: { zh: {
      name: "受治理的设计编写",
      description: "在精确应用服务范围内编写受治理设计事实。",
      actors: ["架构师"],
      scenario: "架构师记录设计决策。",
      valueOutcome: "设计事实保持可查询且范围安全。",
      benefitHypothesis: "治理减少设计漂移。",
      serviceBoundary: ["不会写入其他应用服务范围。"],
      acceptanceCriteria: ["写入保持精确范围。"]
    } }
  };
}

function localizedFunctionalFeature(applicationServiceId: string): FunctionalFeature {
  return {
    id: "ff-governed-authoring",
    name: "Record a scoped design fact",
    description: "Persists one authorized design fact in its owner Scope.",
    lifecycleStatus: "ACTIVE",
    tags: ["governance"],
    trigger: "An authorized author submits a design fact.",
    observableBehavior: "The fact is recorded with its exact Scope.",
    preconditions: ["The caller has write permission."],
    postconditions: ["The fact can be read from its owner Scope."],
    exceptionBehaviors: ["Unauthorized writes are rejected."],
    acceptanceCriteria: ["No write crosses Scope."],
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
    architectureScope: scope(applicationServiceId),
    localizedContent: { zh: {
      name: "记录范围内设计事实",
      description: "在归属范围内持久化一项已授权设计事实。",
      trigger: "授权编写者提交设计事实。",
      observableBehavior: "事实带精确范围被记录。",
      preconditions: ["调用方拥有写权限。"],
      postconditions: ["可以从归属范围读取事实。"],
      exceptionBehaviors: ["未授权写入被拒绝。"],
      acceptanceCriteria: ["没有写入跨越范围。"]
    } }
  };
}

const fixtures = {
  [designerId]: {
    domain: localizedDomain(designerId, "Designer Domain", "设计器领域"),
    proposal: localizedProposal(designerId, "Designer Proposal", "设计器提案"),
    contextPack: localizedContextPack(designerId, "Designer Context", "设计器上下文")
  },
  [policyId]: {
    domain: localizedDomain(policyId, "Policy Domain", "策略领域"),
    proposal: localizedProposal(policyId, "Policy Proposal", "策略提案"),
    contextPack: localizedContextPack(policyId, "Policy Context", "策略上下文")
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SPECFORGE_MCP_SEED;
  persistence.listPersistedAssets.mockImplementation(async (applicationServiceId: keyof typeof fixtures) => [
    { type: "domain", asset: fixtures[applicationServiceId].domain }
  ]);
  persistence.listPersistedProposals.mockImplementation(async (applicationServiceId: keyof typeof fixtures) => [
    fixtures[applicationServiceId].proposal
  ]);
  persistence.listPersistedContextPacks.mockImplementation(async (applicationServiceId: keyof typeof fixtures) => [
    fixtures[applicationServiceId].contextPack
  ]);
  persistence.getPersistedAsset.mockImplementation(async (assetType: string, assetId: string, applicationServiceId: keyof typeof fixtures) => {
    if (assetType === "domain" && assetId === "shared-domain") return fixtures[applicationServiceId].domain;
    throw new Error(`Asset not found: ${assetType}/${assetId}`);
  });
  persistence.renderPersistedAssetAsMarkdown.mockImplementation(async (assetType: string, assetId: string, applicationServiceId: keyof typeof fixtures, locale: "en" | "zh") => {
    const asset = await persistence.getPersistedAsset(assetType, assetId, applicationServiceId);
    return locale === "zh" ? `# ${asset.localizedContent?.zh?.name}\n\n${asset.name}` : `# ${asset.name}`;
  });
  persistence.listPersistedAssetLinks.mockImplementation(async (applicationServiceId: keyof typeof fixtures) => [{
    id: "shared-link",
    sourceType: "proposal",
    sourceId: "shared-proposal",
    targetType: "domain",
    targetId: "shared-domain",
    relationType: "depends-on",
    architectureScope: scope(applicationServiceId),
    createdAt: "2026-07-13T00:00:00.000Z"
  }]);
  persistence.upsertContextPack.mockImplementation(async ({ contextPack }: { contextPack: ContextPack }) => contextPack);
});

describe("scoped MCP derived views", () => {
  it("rejects an unreadable application service before querying persistence", async () => {
    await expect(loadScopedAssetCatalog("com.huawei.celon.runtime")).rejects.toThrow("Scope read is not authorized");
    expect(persistence.listPersistedAssets).not.toHaveBeenCalled();
  });

  it("rejects a persisted payload whose envelope does not match the requested scope", async () => {
    persistence.listPersistedAssets.mockResolvedValueOnce([{ type: "domain", asset: fixtures[designerId].domain }]);
    await expect(loadScopedAssetCatalog(policyId)).rejects.toThrow("escaped requested scope");
  });

  it("constructs an exact catalog for the authorized application service", async () => {
    const designer = await loadScopedAssetCatalog(designerId);
    const policy = await loadScopedAssetCatalog(policyId);

    expect(designer.domains.map((item) => item.name)).toEqual(["Designer Domain"]);
    expect(policy.domains.map((item) => item.name)).toEqual(["Policy Domain"]);
    expect(designer.proposals.map((item) => item.title)).toEqual(["Designer Proposal"]);
  });

  it("loads persisted Feature collections without breaking the scoped catalog", async () => {
    persistence.listPersistedAssets.mockResolvedValueOnce([
      { type: "serviceFeature", asset: localizedServiceFeature(designerId) },
      { type: "functionalFeature", asset: localizedFunctionalFeature(designerId) }
    ]);

    const catalog = await loadScopedAssetCatalog(designerId);

    expect(catalog.serviceFeatures?.map((item) => item.id)).toEqual(["sf-governed-authoring"]);
    expect(catalog.functionalFeatures?.map((item) => item.id)).toEqual(["ff-governed-authoring"]);
  });

  it("isolates and localizes graph nodes with identical logical IDs", async () => {
    const designer = await buildScopedAssetGraph({ applicationServiceId: designerId, locale: "en" });
    const policy = await buildScopedAssetGraph({ applicationServiceId: policyId, locale: "zh" });

    expect(designer.graph.nodes.map((node) => node.label)).toContain("Designer Domain");
    expect(designer.graph.nodes.map((node) => node.label)).not.toContain("Policy Domain");
    expect(policy.graph.nodes.map((node) => node.label)).toContain("策略领域");
    expect(policy.graph.nodes.map((node) => node.label)).toContain("策略上下文");
    expect(policy.graph.nodes.every((node) => node.applicationServiceId === policyId)).toBe(true);
    expect(policy.graph.nodes.map((node) => node.logicalId)).toContain("shared-domain");
    expect(JSON.stringify(policy.canonicalSource)).toContain("Policy Domain");
    expect(JSON.stringify(policy.canonicalSource)).not.toContain("Designer Domain");
  });

  it("builds canonical graph independently and keeps provenance identical across locales", async () => {
    const english = await buildScopedAssetGraph({ applicationServiceId: designerId, locale: "en" });
    const chinese = await buildScopedAssetGraph({ applicationServiceId: designerId, locale: "zh" });

    expect(english.canonicalSource).toEqual(chinese.canonicalSource);
    expect(english.canonicalSource!.graph).not.toBe(english.graph);
    expect(english.canonicalSource!.graph.nodes.map((node) => node.label)).toContain("Designer Context");
    expect(english.canonicalSource!.graph.edges.map((edge) => edge.label)).toContain("depends-on");
    expect(chinese.canonicalSource!.graph.nodes.map((node) => node.label)).not.toContain("设计器上下文");
  });

  it("uses the scoped proposal for impact analysis and preserves its canonical source", async () => {
    const result = await analyzeScopedProposalImpact({
      applicationServiceId: policyId,
      proposalId: "shared-proposal",
      locale: "zh"
    });

    expect(result.canonicalSource.proposal.title).toBe("Policy Proposal");
    expect(result.analysis.impactedAssets).toContainEqual(expect.objectContaining({ id: "shared-domain", label: "策略领域" }));
    expect(JSON.stringify(result)).not.toContain("Designer Proposal");
  });

  it("runs localized governance against the scoped catalog", async () => {
    const english = await runScopedGovernanceChecks({
      applicationServiceId: designerId,
      targetType: "proposal",
      targetId: "shared-proposal",
      locale: "en"
    });
    const chinese = await runScopedGovernanceChecks({
      applicationServiceId: policyId,
      targetType: "proposal",
      targetId: "shared-proposal",
      locale: "zh"
    });

    expect(english.results.map((item) => item.ruleId)).toEqual(chinese.results.map((item) => item.ruleId));
    expect(chinese.results[0]!.message).not.toBe(english.results[0]!.message);
    expect(chinese.canonicalSource).toMatchObject({ title: "Policy Proposal" });
  });

  it("generates and persists canonical English while returning the requested Chinese view", async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    const result = await generateScopedContextPack({
      applicationServiceId: policyId,
      proposalId: "shared-proposal",
      targetAgent: "codex",
      locale: "zh"
    });

    const persisted = persistence.upsertContextPack.mock.calls[0]![0].contextPack as ContextPack;
    expect(result.contextPack.name).toContain("策略提案");
    expect(persisted.name).toContain("Policy Proposal");
    expect(persisted.name).not.toContain("策略提案");
    expect(persisted.architectureScope).toEqual(scope(policyId));
    expect(persisted.localizedContent?.zh?.name).toContain("策略提案");
    expect(() => validateAssetLocalization("contextPack", persisted)).not.toThrow();
    expect(result.canonicalSource.generatedContextPack).toEqual(persisted);
    expect(result.contextPack.id).toBe(persisted.id);
    expect(result.contextPack.proposalId).toBe(persisted.proposalId);
    expect(result.contextPack.includedAssets.map((ref) => ({ type: ref.type, id: ref.id }))).toEqual(
      persisted.includedAssets.map((ref) => ({ type: ref.type, id: ref.id }))
    );
    expect(result.contextPack.includedAssets[0]!.label).toBe("策略领域");
    expect(persisted.includedAssets[0]!.label).toBe("Policy Domain");
    expect(result.canonicalSource.proposal.title).toBe("Policy Proposal");
    expect(result.canonicalSource.assets.map((item) => item.name)).toEqual(["Policy Domain"]);
  });

  it("rejects context generation when the actor has read-only access to the scope", async () => {
    await expect(generateScopedContextPack({
      applicationServiceId: policyId,
      proposalId: "shared-proposal",
      locale: "en"
    })).rejects.toThrow("Scope write is not authorized");
  });

  it("renders localized Markdown while embedding the canonical English source", async () => {
    const result = await renderScopedAssetMarkdown({
      applicationServiceId: policyId,
      assetType: "domain",
      assetId: "shared-domain",
      locale: "zh"
    });

    expect(result.content).toContain("策略领域");
    expect(result.content).toContain("Policy Domain");
    expect(result.canonicalSource.name).toBe("Policy Domain");
  });

  it("renders a scoped localized collection with canonical source and no sibling data", async () => {
    const result = await renderScopedCollectionMarkdown({
      applicationServiceId: policyId,
      assetType: "domain",
      locale: "zh"
    });

    expect(result.content).toContain("策略领域");
    expect(result.content).toContain("Policy Domain");
    expect(result.content).not.toContain("Designer Domain");
  });
});
