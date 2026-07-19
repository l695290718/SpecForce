import { describe, expect, it } from "vitest";
import {
  huaweiArchitectureScopes,
  type ArchitectureScopeRef,
  type FederatedFactEnvelope,
  type ReconciliationInput,
  type SourceObservation,
  type ExternalIdentityMapping,
  contentDigest,
  evaluateObservation,
  reconcileFacts
} from "..";

const designerScopeRecord = huaweiArchitectureScopes.find(
  (scope) => scope.id === "com.huawei.celon.desiner"
)!!;
const siblingScopeRecord = huaweiArchitectureScopes.find(
  (scope) => scope.id === "com.huawei.celon.runtime"
)!!;
const designerScope: ArchitectureScopeRef = {
  applicationServiceId: designerScopeRecord.id,
  scopePath: designerScopeRecord.scopePath
};
const siblingScope: ArchitectureScopeRef = {
  applicationServiceId: siblingScopeRecord.id,
  scopePath: siblingScopeRecord.scopePath
};

type DriftOptions = {
  contentDrift?: boolean;
  localizationDrift?: boolean;
  relationshipDrift?: boolean;
  evidenceDrift?: boolean;
  scopeDrift?: boolean;
};

function createReconciliationFixture(options: DriftOptions = {}): ReconciliationInput {
  const factScope = options.scopeDrift ? siblingScope : designerScope;
  const payload = { name: "Orders API", method: "GET", path: "/orders" };
  const acceptedFact: FederatedFactEnvelope = {
    id: "fact-orders-api",
    architectureScope: factScope,
    assetType: "api",
    schemaVersion: "1",
    payload,
    normalizedDigest: contentDigest(payload),
    provenance: {
      sourceSystem: "SpecForge",
      connectorInstanceId: "specforge-core",
      observedAt: "2026-07-19T00:00:00.000Z"
    },
    authority: "SPECFORGE",
    confidence: 1,
    status: "PROMOTED"
  };
  const sourceObservation: SourceObservation = {
    id: "observation-orders-api",
    architectureScope: designerScope,
    connectorInstanceId: "openapi-orders",
    sourceNamespace: "orders-service",
    externalAssetType: "path",
    externalId: "GET /orders",
    payload: options.contentDrift ? { ...payload, path: "/v2/orders" } : payload,
    normalizedDigest: contentDigest(options.contentDrift ? { ...payload, path: "/v2/orders" } : payload),
    sourceVersion: "42",
    observedAt: "2026-07-19T00:00:00.000Z",
    status: "PROMOTED",
    provenance: {
      sourceSystem: "Orders Service",
      connectorInstanceId: "openapi-orders",
      externalIdentity: "GET /orders",
      externalVersion: "42",
      sourceTimestamp: "2026-07-19T00:00:00.000Z",
      observedAt: "2026-07-19T00:00:00.000Z"
    }
  };
  const identityMapping: ExternalIdentityMapping = {
    id: "mapping-orders-api",
    architectureScope: designerScope,
    connectorInstanceId: "openapi-orders",
    sourceNamespace: "orders-service",
    externalAssetType: "path",
    externalId: "GET /orders",
    assetType: "api",
    assetId: "fact-orders-api",
    matchStatus: "UNAMBIGUOUS",
    normalizedDigest: contentDigest({ assetId: "fact-orders-api", externalId: "GET /orders" })
  };
  return {
    architectureScope: designerScope,
    acceptedFacts: [acceptedFact],
    observations: [sourceObservation],
    identityMappings: [identityMapping],
    relationshipDrift: options.relationshipDrift ?? false,
    evidenceDrift: options.evidenceDrift ?? false,
    localizationDrift: options.localizationDrift ?? false
  };
}

describe("federation domain", () => {
  it("produces the same digest when object keys are reordered", () => {
    expect(contentDigest({ b: 2, a: 1 })).toBe(contentDigest({ a: 1, b: 2 }));
  });

  it("does not promote an ambiguous identity match", () => {
    expect(evaluateObservation({ authority: "EXTERNAL", identityMatch: "AMBIGUOUS", policyAllowsPromotion: true }))
      .toEqual({ action: "CONFLICT", reason: "IDENTITY_CONFLICT" });
  });

  it("promotes only an unambiguous externally authoritative observation", () => {
    expect(evaluateObservation({ authority: "EXTERNAL", identityMatch: "UNAMBIGUOUS", policyAllowsPromotion: true }))
      .toEqual({ action: "PROMOTE", reason: "EXTERNAL_AUTHORITY" });
  });

  it("reports content and localization drift without changing inputs", () => {
    const inputFacts = createReconciliationFixture({ contentDrift: true, localizationDrift: true });
    const before = JSON.stringify(inputFacts);
    const report = reconcileFacts(inputFacts);
    expect(report.issues.map((issue) => issue.code)).toEqual(["CONTENT_DRIFT", "LOCALIZATION_DRIFT"]);
    expect(report.architectureScope).toEqual(designerScope);
    expect(report.root).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(inputFacts)).toBe(before);
  });
});
