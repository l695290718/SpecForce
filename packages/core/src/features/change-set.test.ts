import { describe, expect, it } from "vitest";
import {
  validateFeatureChangeSet,
  type FeatureChangeSetCatalog,
  type FeatureChangeSetRequest,
  type FunctionalFeature,
  type ServiceFeature
} from "../index";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf/p/sp/m/com.huawei.celon.desiner" };
const now = "2026-09-03T00:00:00.000Z";
const service: ServiceFeature = {
  id: "sf-a", name: "Service A", description: "Delivers value A.", lifecycleStatus: "ACTIVE", tags: [], actors: ["Architect"],
  scenario: "The architect requests A.", valueOutcome: "A is delivered.", benefitHypothesis: "A reduces effort.",
  serviceBoundary: ["Only A."], acceptanceCriteria: ["A is observable."], createdAt: now, updatedAt: now, architectureScope: scope,
  localizedContent: { zh: { name: "服务 A", description: "交付价值 A。", actors: ["架构师"], scenario: "架构师请求 A。", valueOutcome: "交付 A。", benefitHypothesis: "A 降低工作量。", serviceBoundary: ["仅包含 A。"], acceptanceCriteria: ["A 可观察。"] } }
};
const functional: FunctionalFeature = {
  id: "ff-a", name: "Function A", description: "Performs behavior A.", lifecycleStatus: "ACTIVE", tags: [],
  trigger: "A is requested.", observableBehavior: "Behavior A completes.", preconditions: [], postconditions: ["A exists."], exceptionBehaviors: [],
  acceptanceCriteria: ["A completes."], createdAt: now, updatedAt: now, architectureScope: scope,
  localizedContent: { zh: { name: "功能 A", description: "执行行为 A。", trigger: "请求 A。", observableBehavior: "行为 A 完成。", preconditions: [], postconditions: ["A 存在。"], exceptionBehaviors: [], acceptanceCriteria: ["A 完成。"] } }
};
const endpoint = (assetType: "serviceFeature" | "functionalFeature", assetId: string) => ({ ...scope, nodeType: assetType, logicalId: assetId, rootAssetType: assetType, rootAssetId: assetId } as const);
const request: FeatureChangeSetRequest = {
  architectureScope: scope,
  designChangeSessionId: "session-a",
  correlationId: "correlation-a",
  idempotencyKey: "feature-a",
  assets: [{ assetType: "serviceFeature", asset: service }, { assetType: "functionalFeature", asset: functional }],
  relationships: [{ relationType: "CONTRIBUTES_TO", source: endpoint("functionalFeature", "ff-a"), target: endpoint("serviceFeature", "sf-a") }]
};
const emptyCatalog: FeatureChangeSetCatalog = { assets: [], endpoints: [] };

describe("Feature Change Set validation", () => {
  it("accepts a same-Scope mixed batch", () => {
    expect(validateFeatureChangeSet(request, emptyCatalog)).toMatchObject({ requestDigest: expect.any(String) });
  });

  it.each([
    ["FEATURE_SCOPE_MISMATCH", { ...request, assets: [{ assetType: "serviceFeature" as const, asset: { ...service, architectureScope: { ...scope, applicationServiceId: "sibling" } } }] }],
    ["FEATURE_ID_COLLISION", { ...request, assets: [{ assetType: "serviceFeature" as const, asset: service }, { assetType: "functionalFeature" as const, asset: { ...functional, id: service.id } }] }],
    ["FEATURE_SELF_RELATIONSHIP", { ...request, relationships: [{ relationType: "CONTRIBUTES_TO" as const, source: endpoint("functionalFeature", "ff-a"), target: endpoint("functionalFeature", "ff-a") }] }],
    ["FEATURE_RELATIONSHIP_INVALID", { ...request, relationships: [{ relationType: "CONTRIBUTES_TO" as const, source: endpoint("serviceFeature", "sf-a"), target: endpoint("functionalFeature", "ff-a") }] }],
    ["FEATURE_DUPLICATE_RELATIONSHIP", { ...request, relationships: [request.relationships[0]!, request.relationships[0]!] }]
  ])("rejects %s", (code, invalid) => {
    expect(() => validateFeatureChangeSet(invalid, emptyCatalog)).toThrowError(code);
  });

  it("requires the current revision for updates", () => {
    const catalog = { assets: [{ id: "sf-a", assetType: "serviceFeature", version: "7" }], endpoints: [endpoint("serviceFeature", "sf-a")] };
    const update = { ...request, relationships: [], assets: [{ assetType: "serviceFeature" as const, asset: service, expectedVersion: "6" }] };
    expect(() => validateFeatureChangeSet(update, catalog)).toThrowError("FEATURE_VERSION_CONFLICT");
    expect(validateFeatureChangeSet({ ...update, assets: [{ ...update.assets[0]!, expectedVersion: "7" }] }, catalog).requestDigest).toBeTruthy();
  });
});
