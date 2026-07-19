import { describe, expect, expectTypeOf, it } from "vitest";
import {
  huaweiArchitectureScopes,
  type ArchitectureScopeRef,
  type FederatedFactEnvelope,
  type ReconciliationInput,
  type SourceObservation,
  type ExternalIdentityMapping,
  normalizeForDigest,
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
  mappingScopeDrift?: boolean;
  undeclaredChange?: boolean;
  observationScopeDrift?: boolean;
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
    localizedContent: { zh: { name: "订单 API" } },
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
    architectureScope: options.observationScopeDrift ? siblingScope : designerScope,
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
    architectureScope: options.mappingScopeDrift ? siblingScope : designerScope,
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
    identityMappings: options.undeclaredChange ? [] : [identityMapping],
    relationshipDrift: options.relationshipDrift ?? false,
    evidenceDrift: options.evidenceDrift ?? false,
    localizationDrift: options.localizationDrift ?? false
  };
}

describe("federation domain", () => {
  it("produces the same digest when object keys are reordered", () => {
    expect(contentDigest({ b: 2, a: 1 })).toBe(contentDigest({ a: 1, b: 2 }));
  });

  it("uses locale-independent key ordering and preserves repeated references", () => {
    expect(normalizeForDigest({ a: 1, Z: 2 })).toBe('{"Z":2,"a":1}');
    const shared = { value: 1 };
    expect(contentDigest({ left: shared, right: shared })).toBe(
      contentDigest({ left: { value: 1 }, right: { value: 1 } })
    );
  });

  it("uses locale-independent ordering when building the reconciliation root", () => {
    const fixture = createReconciliationFixture();
    const acceptedFact = fixture.acceptedFacts[0]!;
    const acceptedFacts = [
      { ...acceptedFact, id: "a" },
      { ...acceptedFact, id: "Z" }
    ];
    const report = reconcileFacts({
      ...fixture,
      acceptedFacts,
      observations: [],
      identityMappings: []
    });
    expect(report.root).toBe(contentDigest({
      architectureScope: fixture.architectureScope,
      factDigests: [
        { factId: "Z", digest: acceptedFact.normalizedDigest },
        { factId: "a", digest: acceptedFact.normalizedDigest }
      ],
      issues: []
    }));
  });

  it("does not promote an ambiguous identity match", () => {
    expect(evaluateObservation({ authority: "EXTERNAL", identityMatch: "AMBIGUOUS", policyAllowsPromotion: true }))
      .toEqual({ action: "CONFLICT", reason: "IDENTITY_CONFLICT" });
  });

  it("promotes only an unambiguous externally authoritative observation", () => {
    expect(evaluateObservation({ authority: "EXTERNAL", identityMatch: "UNAMBIGUOUS", policyAllowsPromotion: true }))
      .toEqual({ action: "PROMOTE", reason: "EXTERNAL_AUTHORITY" });
  });

  it("keeps a human-facing observation as a candidate until Chinese localization is complete", () => {
    expect(evaluateObservation({
      authority: "EXTERNAL",
      identityMatch: "UNAMBIGUOUS",
      policyAllowsPromotion: true,
      humanFacing: true,
      hasCompleteChineseLocalization: false
    })).toEqual({ action: "CANDIDATE", reason: "LOCALIZATION_INCOMPLETE" });
  });

  it("requires a Chinese overlay on every promoted fact envelope", () => {
    const acceptedFact = createReconciliationFixture().acceptedFacts[0]!;
    expect(acceptedFact.status).toBe("PROMOTED");
    expect(acceptedFact.localizedContent.zh).toEqual({ name: "订单 API" });
    expectTypeOf<FederatedFactEnvelope["localizedContent"]>().toMatchTypeOf<{
      zh: Record<string, unknown>;
    }>();
  });

  it("conflicts when authority is missing or promotion policy is disabled", () => {
    expect(evaluateObservation({ identityMatch: "UNAMBIGUOUS", policyAllowsPromotion: true }))
      .toEqual({ action: "CONFLICT", reason: "AUTHORITY_MISSING" });
    expect(evaluateObservation({ authority: "EXTERNAL", identityMatch: "UNAMBIGUOUS", policyAllowsPromotion: false }))
      .toEqual({ action: "CONFLICT", reason: "POLICY_DISABLED" });
  });

  it("diagnoses an identity mapping that crosses the reconciliation Scope", () => {
    const report = reconcileFacts(createReconciliationFixture({ mappingScopeDrift: true }));
    expect(report.issues.map((issue) => issue.code)).toEqual(["SCOPE_DRIFT"]);
    expect(report.status).toBe("BLOCKED");
  });

  it("reports an observation without correspondence as an undeclared change", () => {
    const report = reconcileFacts(createReconciliationFixture({ undeclaredChange: true }));
    expect(report.issues.map((issue) => issue.code)).toEqual(["UNDECLARED_CHANGE"]);
  });

  it("reports an out-of-scope unmatched observation as Scope drift", () => {
    const report = reconcileFacts(createReconciliationFixture({
      observationScopeDrift: true,
      undeclaredChange: true
    }));
    expect(report.issues.map((issue) => issue.code)).toEqual(["SCOPE_DRIFT"]);
  });

  it("normalizes undefined and unsupported values deterministically for digests", () => {
    expect(normalizeForDigest(undefined)).toBe('{"$type":"undefined"}');
    expect(normalizeForDigest(1n)).toBe('{"$type":"bigint","value":"1"}');
    expect(contentDigest(Symbol("scope"))).toBe(contentDigest(Symbol("scope")));
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
