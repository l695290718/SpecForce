import { describe, expect, it } from "vitest";
import { semanticProjectionIdentity, type SemanticSourceBinding } from "./semantic-identity";
import { materializeSemanticProjection, type SemanticProjectionInput } from "./semantic-projection";

const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

const sourceBinding: SemanticSourceBinding = {
  sourceProjectionManifestId: "projection-manifest:designer:v6",
  sourceCoverageManifestId: "coverage-generation:designer:3a:v13",
  knowledgeGenerationId: "knowledge-generation:designer:v6",
  coverageGenerationId: "coverage-generation:designer:3a:v13",
  relationshipVersion: "graph-version:designer:42",
  catalogVersion: "catalog:designer:307",
  catalogDigest: "sha256:catalog-307",
  semanticSchemaVersion: "nebula.3a.semantic.v1"
};

const identity = semanticProjectionIdentity(scope, {
  id: "nebula-manifest:v6",
  generationId: "nebula-generation:v6",
  baselineId: "knowledge-baseline:designer:3a:v6",
  profileId: "profile-default",
  profileVersion: "1",
  projectionSchemaVersion: "nebula.3a.v1"
}, sourceBinding);

const unit = {
  ...scope,
  generationId: identity.generationId,
  baselineId: identity.baselineId,
  projectionManifestId: identity.manifestId,
  unitIdentity: "unit:sys:orders",
  layer: "SYS" as const,
  kind: "SERVICE" as const,
  canonicalName: "Orders Service",
  aliases: [],
  memberCount: 1,
  criticality: 0.8,
  completeness: 1,
  evidenceCount: 1,
  unclassifiedMemberCount: 0,
  contentDigest: "unit-digest"
};

function input(overrides: Partial<SemanticProjectionInput> = {}): SemanticProjectionInput {
  return {
    identity,
    assets: [{ ...scope, generationId: identity.generationId, baselineId: identity.baselineId, projectionManifestId: identity.manifestId, assetType: "api", assetId: "orders", logicalId: "api:orders", contentDigest: "asset-digest" }],
    assertions: [{ ...scope, generationId: identity.generationId, baselineId: identity.baselineId, projectionManifestId: identity.manifestId, assertionId: "assertion:a1", semanticIdentity: "api.orders", factType: "api-ownership", layer: "SYS", confidence: 0.98, status: "ACCEPTED", contentDigest: "assertion-digest" }],
    units: [unit],
    members: [{ ...scope, generationId: identity.generationId, baselineId: identity.baselineId, projectionManifestId: identity.manifestId, unitIdentity: unit.unitIdentity, assertionId: "assertion:a1", assetType: "api", semanticIdentity: "api:orders", contentDigest: "member-digest" }],
    mappings: [],
    coverage: [{ ...scope, generationId: sourceBinding.coverageGenerationId, baselineId: identity.baselineId, manifestId: sourceBinding.sourceCoverageManifestId, assetType: "api", assetId: "orders", role: "MEMBERSHIP", status: "COVERED", pathEvidence: [], rowDigest: "coverage-digest" }],
    assetRelationships: [],
    assertionRelationships: [],
    architectureRelationships: [],
    ...overrides
  };
}

describe("semantic 3A projection materializer", () => {
  it("projects a direct assertion through the asset to a SYS unit", () => {
    const result = materializeSemanticProjection(input());
    expect(result.edges.map(({ family, sourceId, targetId }) => ({ family, sourceId, targetId }))).toEqual([
      { family: "ASSERTION_SUBJECT", sourceId: "assertion:a1", targetId: "asset:api:orders" },
      { family: "REALIZED_BY", sourceId: "assertion:a1", targetId: "unit:sys:orders" }
    ]);
    expect(result.vertices.map((vertex) => vertex.family)).toEqual(["ArchitectureUnit", "DesignAsset", "KnowledgeAssertion"]);
  });

  it("preserves TRACE path evidence without inventing an assertion", () => {
    const base = input({
      assertions: [],
      members: [{ ...input().members[0]!, assertionId: "trace-member" }],
      coverage: [
        { ...input().coverage[0]!, assetId: "trace", role: "TRACEABILITY", status: "COVERED", terminalMemberId: "trace-member", pathEvidence: [{ relationshipIdentity: "rel-1", sourceSemanticIdentity: "api:trace", targetSemanticIdentity: "service:orders", relationCode: "CALLS" }] },
        { ...input().coverage[0]!, assetId: "exempt", role: "EXEMPTION", status: "COVERED", reasonCode: "EXPLICIT_EXEMPTION" },
        { ...input().coverage[0]!, assetId: "blocked", role: "TRACEABILITY", status: "BLOCKED", reasonCode: "ENDPOINT_NOT_FOUND" }
      ],
      assets: ["trace", "exempt", "blocked"].map((assetId) => ({ ...input().assets[0]!, assetId, logicalId: `api:${assetId}` }))
    });
    const result = materializeSemanticProjection(base);
    expect(result.vertices.filter((vertex) => vertex.family === "DesignAsset").map((vertex) => vertex.mappingMode)).toEqual(["BLOCKED", "EXEMPT", "TRACE"]);
    expect(result.vertices.filter((vertex) => vertex.family === "KnowledgeAssertion")).toEqual([]);
    expect(result.edges.map(({ family, code }) => ({ family, code }))).toEqual([{ family: "ASSET_RELATION", code: "CALLS" }]);
  });

  it("fails closed for duplicate direct targets and foreign Scope", () => {
    const duplicate = input({ members: [
      input().members[0]!,
      { ...input().members[0]!, unitIdentity: "unit:sys:other" }
    ], units: [unit, { ...unit, unitIdentity: "unit:sys:other" }] });
    expect(() => materializeSemanticProjection(duplicate)).toThrow("SEMANTIC_AMBIGUOUS_DIRECT_MAPPING");
    expect(() => materializeSemanticProjection(input({ assets: [{ ...input().assets[0]!, applicationServiceId: "com.huawei.celon.other" }] }))).toThrow("SEMANTIC_SCOPE_MISMATCH");
  });
});
