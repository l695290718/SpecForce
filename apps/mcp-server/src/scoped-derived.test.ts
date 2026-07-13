import { seedData, scopeById } from "@specforge/core";
import type { ArchitectureScopeRef, DomainModel, Proposal } from "@specforge/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => ({
  listPersistedAssetLinks: vi.fn(),
  listPersistedAssets: vi.fn(),
  listPersistedContextPacks: vi.fn(),
  listPersistedProposals: vi.fn()
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

const fixtures = {
  [designerId]: {
    domain: localizedDomain(designerId, "Designer Domain", "设计器领域"),
    proposal: localizedProposal(designerId, "Designer Proposal", "设计器提案")
  },
  [policyId]: {
    domain: localizedDomain(policyId, "Policy Domain", "策略领域"),
    proposal: localizedProposal(policyId, "Policy Proposal", "策略提案")
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
  persistence.listPersistedContextPacks.mockResolvedValue([]);
  persistence.listPersistedAssetLinks.mockResolvedValue([]);
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

  it("isolates and localizes graph nodes with identical logical IDs", async () => {
    const designer = await buildScopedAssetGraph({ applicationServiceId: designerId, locale: "en" });
    const policy = await buildScopedAssetGraph({ applicationServiceId: policyId, locale: "zh" });

    expect(designer.graph.nodes.map((node) => node.label)).toContain("Designer Domain");
    expect(designer.graph.nodes.map((node) => node.label)).not.toContain("Policy Domain");
    expect(policy.graph.nodes.map((node) => node.label)).toContain("策略领域");
    expect(policy.graph.nodes.every((node) => node.applicationServiceId === policyId)).toBe(true);
    expect(policy.graph.nodes.map((node) => node.logicalId)).toContain("shared-domain");
    expect(JSON.stringify(policy.canonicalSource)).toContain("Policy Domain");
    expect(JSON.stringify(policy.canonicalSource)).not.toContain("Designer Domain");
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

  it("requires write scope for generation and returns localized context with canonical sources", async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    const result = await generateScopedContextPack({
      applicationServiceId: policyId,
      proposalId: "shared-proposal",
      targetAgent: "codex",
      locale: "zh"
    });

    expect(result.contextPack.name).toContain("策略提案");
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
