import { validateAssetLocalization, type Asset, type AssetType } from "../../packages/core/src";
import { describe, expect, it } from "vitest";
import {
  architectureChangeProposals,
  bilingualDesignAdr,
  selfDesignAdr,
  selfDesignApis,
  selfDesignAssetLinks,
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
} from "./specforge-self-design";

const expectedIds = [
  "proposal-strict-application-service-isolation",
  "proposal-agent-service-workspace",
  "proposal-mcp-native-scoped-seeding",
  "proposal-bilingual-design-assets"
];

describe("SpecForge architecture change proposals", () => {
  it("defines the implemented architecture changes", () => {
    expect(architectureChangeProposals.map((proposal) => proposal.id)).toEqual(expectedIds);
    expect(architectureChangeProposals.every((proposal) => proposal.status === "implemented")).toBe(true);
  });

  it("provides canonical English and complete Chinese proposal content", () => {
    for (const proposal of architectureChangeProposals) {
      expect(proposal.title).toBeTruthy();
      expect(proposal.description).toBeTruthy();
      expect(proposal.background).toBeTruthy();
      expect(proposal.goal).toBeTruthy();
      expect(proposal.nonGoal).toBeTruthy();
      expect(proposal.scope).toBeTruthy();
      expect(proposal.specChanges.length).toBeGreaterThan(0);
      expect(proposal.risks.length).toBeGreaterThan(0);
      expect(proposal.rolloutPlan).toBeTruthy();
      expect(proposal.rollbackPlan).toBeTruthy();

      const content = proposal.localizedContent?.zh;
      expect(content?.title).toBeTruthy();
      expect(content?.description).toBeTruthy();
      expect(content?.background).toBeTruthy();
      expect(content?.goal).toBeTruthy();
      expect(content?.nonGoal).toBeTruthy();
      expect(content?.scope).toBeTruthy();
      expect(content?.specChanges?.length).toBeGreaterThan(0);
      expect(content?.risks?.length).toBeGreaterThan(0);
      expect(content?.rolloutPlan).toBeTruthy();
      expect(content?.rollbackPlan).toBeTruthy();
    }
  });
});

describe("Task 4 bilingual seed inventory", () => {
  it("provides canonical English and complete Chinese overlays for every exported seed asset", () => {
    const issues: string[] = [];
    for (const { type, asset } of exportedSeedAssets()) {
      try {
        validateAssetLocalization(type, asset);
      } catch (error) {
        issues.push(`${type}/${asset.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    expect(issues).toEqual([]);
  });

  it("normalizes legacy proposal English overlays away", () => {
    const proposals = [selfDesignProposal, ...architectureChangeProposals];

    expect(proposals.every((proposal) => proposal.localizedContent?.en === undefined)).toBe(true);
    expect(proposals.map((proposal) => proposal.title).every((title) => /[A-Za-z]/u.test(title))).toBe(true);
  });

  it("adds Task 4 design records and links them to MCP, data, governance, and UI assets", () => {
    expect(architectureChangeProposals.map((proposal) => proposal.id)).toContain("proposal-bilingual-design-assets");
    expect(selfDesignAdr.id).toBe("adr-mcp-first-architecture");
    expect(bilingualDesignAdr.id).toBe("adr-canonical-english-localized-overlay");
    expect(selfDesignBusinessRules.map((rule) => rule.id)).toContain("rule-bilingual-asset-completeness");

    expect(selfDesignAssetLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: "proposal",
          sourceId: "proposal-bilingual-design-assets",
          targetType: "api",
          targetId: "api-specforge-mcp-tools"
        }),
        expect.objectContaining({
          sourceType: "proposal",
          sourceId: "proposal-bilingual-design-assets",
          targetType: "dataModel",
          targetId: "data-specforge-i18n"
        }),
        expect.objectContaining({
          sourceType: "adr",
          sourceId: "adr-canonical-english-localized-overlay",
          targetType: "dataModel",
          targetId: "data-specforge-assets"
        }),
        expect.objectContaining({
          sourceType: "businessRule",
          sourceId: "rule-bilingual-asset-completeness",
          targetType: "api",
          targetId: "api-specforge-asset-upsert"
        }),
        expect.objectContaining({
          sourceType: "businessRule",
          sourceId: "rule-bilingual-asset-completeness",
          targetType: "api",
          targetId: "api-specforge-web-console"
        })
      ])
    );
  });
});

function exportedSeedAssets(): Array<{ type: AssetType; asset: Asset }> {
  return [
    { type: "domain", asset: selfDesignDomain },
    ...selfDesignDataModels.map((asset) => ({ type: "dataModel" as const, asset })),
    ...selfDesignApis.map((asset) => ({ type: "api" as const, asset })),
    ...selfDesignEvents.map((asset) => ({ type: "event" as const, asset })),
    ...selfDesignBusinessRules.map((asset) => ({ type: "businessRule" as const, asset })),
    ...selfDesignStateMachines.map((asset) => ({ type: "stateMachine" as const, asset })),
    { type: "integration", asset: selfDesignIntegration },
    ...selfDesignQualityRequirements.map((asset) => ({ type: "quality" as const, asset })),
    { type: "observability", asset: selfDesignObservability },
    { type: "adr", asset: selfDesignAdr },
    { type: "adr", asset: bilingualDesignAdr },
    { type: "proposal", asset: selfDesignProposal },
    ...architectureChangeProposals.map((asset) => ({ type: "proposal" as const, asset })),
    { type: "contextPack", asset: selfDesignContextPack }
  ];
}
