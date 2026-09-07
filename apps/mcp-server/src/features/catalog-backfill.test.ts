import { describe, expect, it } from "vitest";
import {
  validateFeatureChangeSet,
  type ArchitectureScopeRef,
  type AssetNodeIdentity,
  type FeatureChangeSetCatalog,
  type FeatureChangeSetRequest
} from "@specforge/core";
import type { SystemKnowledgeAsset, SystemKnowledgeRelationship } from "../knowledge-readiness/read";
import { buildFeatureCatalogBackfillPlan } from "./catalog-backfill";

const scope: ArchitectureScopeRef = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};
const now = "2026-09-07T00:00:00.000Z";

function asset(id: string, type: SystemKnowledgeAsset["type"], name = id): SystemKnowledgeAsset {
  return { id, type, name, summary: `${name} summary`, updatedAt: now, contentDigest: `${id}-digest`, architectureScope: scope };
}

describe("buildFeatureCatalogBackfillPlan", () => {
  it("builds bilingual Features and only ontology-valid direct links", () => {
    const assets = [
      asset("domain-design", "domain", "Design governance"),
      asset("api-feature-catalog", "api", "Feature catalog API"),
      asset("model-feature", "dataModel", "Feature model"),
      asset("rule-feature", "businessRule", "Feature write rule"),
      asset("proposal-feature", "proposal", "Feature catalog delivery"),
      asset("context-feature", "contextPack", "Feature authoring context")
    ];
    const relationships: SystemKnowledgeRelationship[] = [{
      id: "context-to-proposal",
      sourceType: "contextPack",
      sourceId: "context-feature",
      targetType: "proposal",
      targetId: "proposal-feature",
      relationType: "IMPLEMENTS_CONTEXT_FOR",
      confidence: 1,
      architectureScope: scope
    }];

    const plan = buildFeatureCatalogBackfillPlan({ architectureScope: scope, assets, relationships, now });
    const serviceFeatures = plan.assets.filter((mutation) => mutation.assetType === "serviceFeature");
    const functionalFeatures = plan.assets.filter((mutation) => mutation.assetType === "functionalFeature");

    expect(serviceFeatures).toHaveLength(8);
    expect(functionalFeatures.length).toBeGreaterThan(0);
    expect(serviceFeatures.every((mutation) => mutation.asset.localizedContent?.zh?.name)).toBe(true);
    expect(functionalFeatures.every((mutation) => mutation.asset.localizedContent?.zh?.name)).toBe(true);
    expect(plan.directMappings).toEqual(expect.arrayContaining([
      expect.objectContaining({ assetId: "domain-design", featureType: "serviceFeature", relationType: "OWNS" }),
      expect.objectContaining({ assetId: "api-feature-catalog", featureType: "functionalFeature", relationType: "EXPOSES" }),
      expect.objectContaining({ assetId: "model-feature", featureType: "functionalFeature", relationType: "READS" }),
      expect.objectContaining({ assetId: "proposal-feature", featureType: "serviceFeature", relationType: "IMPACTS" })
    ]));
    expect(plan.indirectMappings).toContainEqual(expect.objectContaining({ assetId: "context-feature", viaAssetId: "proposal-feature" }));
    expect(plan.exceptions).toEqual([]);

    const sourceEndpoints = new Map<string, AssetNodeIdentity>();
    for (const relationship of plan.relationships) {
      for (const endpoint of [relationship.source, relationship.target]) {
        if (endpoint.nodeType !== "serviceFeature" && endpoint.nodeType !== "functionalFeature") {
          sourceEndpoints.set(`${endpoint.nodeType}:${endpoint.logicalId}`, endpoint);
        }
      }
    }
    const catalog: FeatureChangeSetCatalog = { assets: [], endpoints: [...sourceEndpoints.values()] };
    const request: FeatureChangeSetRequest = {
      architectureScope: scope,
      designChangeSessionId: "design-change-session-test",
      correlationId: "feature-catalog-backfill-test",
      idempotencyKey: "feature-catalog-backfill-test",
      assets: plan.assets,
      relationships: plan.relationships
    };
    expect(() => validateFeatureChangeSet(request, catalog)).not.toThrow();
  });

  it("records an explicit exception when an unsupported asset has no evidenced path", () => {
    const plan = buildFeatureCatalogBackfillPlan({
      architectureScope: scope,
      assets: [asset("integration-orphan", "integration", "Orphan integration")],
      relationships: [],
      now
    });

    expect(plan.exceptions).toEqual([{ assetId: "integration-orphan", assetType: "integration", reason: "ONTOLOGY_DIRECT_FEATURE_LINK_UNSUPPORTED" }]);
  });

  it("is deterministic for the same bounded knowledge input", () => {
    const input = { architectureScope: scope, assets: [asset("api-a", "api"), asset("model-a", "dataModel")], relationships: [], now };
    expect(buildFeatureCatalogBackfillPlan(input).digest).toBe(buildFeatureCatalogBackfillPlan({ ...input, assets: [...input.assets].reverse() }).digest);
  });
});
