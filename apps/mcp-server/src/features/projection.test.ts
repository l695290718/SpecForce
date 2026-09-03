import { describe, expect, it } from "vitest";
import { mapAssetSearchProjection } from "../scoped-read-projection";

describe("Feature search projection", () => {
  it("projects bilingual text and lifecycle status", () => {
    const scope = { applicationServiceId: "service-a", scopePath: "family/product/sub/module/service-a" };
    const projection = mapAssetSearchProjection({ architectureScope: scope, assetType: "serviceFeature", catalogVersion: 4, asset: {
      id: "sf-a", name: "Assisted design", summary: "Governed assistance", lifecycleStatus: "ACTIVE", owner: "architecture", tags: [], actors: ["Architect"], scenario: "Design", valueOutcome: "Faster delivery", benefitHypothesis: "Less drift", serviceBoundary: ["Design"], acceptanceCriteria: ["Accepted"], architectureScope: scope, createdAt: "2026-09-03T00:00:00.000Z", updatedAt: "2026-09-03T00:00:00.000Z",
      localizedContent: { zh: { name: "辅助设计", summary: "受治理的设计辅助", actors: ["架构师"], scenario: "设计", valueOutcome: "更快交付", benefitHypothesis: "减少漂移", serviceBoundary: ["设计"], acceptanceCriteria: ["已验收"] } }
    } });
    expect(projection).toMatchObject({ localizedNameZh: "辅助设计", status: "ACTIVE" });
    expect(projection.searchDocument).toContain("辅助设计");
  });
});
