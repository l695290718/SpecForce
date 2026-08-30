import { describe, expect, it } from "vitest";
import { materializeAsset3AMappings, type Asset3AMappingCoverageSource } from "./asset-mapping";
import type { ArchitectureUnitMemberProjection, ArchitectureUnitProjection } from "./types";

const scope = { applicationServiceId: "com.example.service", scopePath: "product/module/com.example.service" };
const identity = {
  ...scope,
  generationId: "generation-1",
  baselineId: "baseline-1",
  projectionManifestId: "manifest-1"
};
const unit: ArchitectureUnitProjection = {
  ...identity,
  unitIdentity: "unit:sys:policy",
  layer: "SYS",
  kind: "SERVICE",
  canonicalName: "Policy service",
  aliases: [],
  memberCount: 1,
  criticality: 1,
  completeness: 1,
  evidenceCount: 1,
  unclassifiedMemberCount: 0,
  contentDigest: "unit-digest"
};
const member: ArchitectureUnitMemberProjection = {
  ...identity,
  unitIdentity: unit.unitIdentity,
  assertionId: "revision-1",
  assetType: "api",
  semanticIdentity: "api:api-policy",
  contentDigest: "member-digest"
};
function coverage(overrides: Partial<Asset3AMappingCoverageSource> = {}): Asset3AMappingCoverageSource {
  return {
    ...scope,
    generationId: identity.generationId,
    baselineId: identity.baselineId,
    manifestId: identity.projectionManifestId,
    assetType: "api",
    assetId: "api-policy",
    role: "MEMBERSHIP",
    status: "COVERED",
    pathEvidence: [],
    rowDigest: "row-digest",
    ...overrides
  };
}

describe("asset-to-3A mapping materializer", () => {
  it("makes a governed member a DIRECT assignment", () => {
    const [result] = materializeAsset3AMappings({
      ...identity,
      coverage: [coverage()],
      members: [member],
      units: [unit]
    });
    expect(result).toMatchObject({
      mappingMode: "DIRECT",
      targetUnitIdentity: unit.unitIdentity,
      directMembershipRevisionId: member.assertionId
    });
  });

  it("makes a covered terminal path a TRACE mapping", () => {
    const [result] = materializeAsset3AMappings({
      ...identity,
      coverage: [
        coverage({
          assetId: "api-child",
          role: "TRACEABILITY",
          terminalMemberId: member.assertionId,
          pathEvidence: [
            {
              relationshipIdentity: "rel-1",
              sourceSemanticIdentity: "api:api-child",
              targetSemanticIdentity: member.semanticIdentity,
              relationCode: "CALLS"
            }
          ]
        })
      ],
      members: [member],
      units: [unit]
    });
    expect(result).toMatchObject({
      mappingMode: "TRACE",
      targetUnitIdentity: unit.unitIdentity,
      terminalMemberId: member.assertionId
    });
  });

  it("fails closed for conflicting direct targets", () => {
    const second: ArchitectureUnitProjection = {
      ...unit,
      unitIdentity: "unit:sys:other",
      canonicalName: "Other service"
    };
    const secondMember: ArchitectureUnitMemberProjection = {
      ...member,
      unitIdentity: second.unitIdentity,
      assertionId: "revision-2",
      contentDigest: "member-digest-2"
    };
    const [result] = materializeAsset3AMappings({
      ...identity,
      coverage: [coverage()],
      members: [member, secondMember],
      units: [unit, second]
    });
    expect(result).toMatchObject({ mappingMode: "BLOCKED", reasonCode: "MULTIPLE_DIRECT_TARGETS" });
  });

  it("resolves legacy semantic identities to their canonical asset ids", () => {
    const dataUnit: ArchitectureUnitProjection = {
      ...unit,
      unitIdentity: "unit:tech:store",
      layer: "TECH",
      kind: "TECHNOLOGY_SERVICE"
    };
    const dataMember: ArchitectureUnitMemberProjection = {
      ...member,
      unitIdentity: dataUnit.unitIdentity,
      assertionId: "asset:dataModel:data-specforge-assets",
      assetType: "dataModel",
      semanticIdentity: "dataModel:specforge-assets"
    };
    const [result] = materializeAsset3AMappings({
      ...identity,
      coverage: [coverage({ assetType: "dataModel", assetId: "data-specforge-assets" })],
      members: [dataMember],
      units: [dataUnit]
    });
    expect(result).toMatchObject({ mappingMode: "DIRECT", targetUnitIdentity: dataUnit.unitIdentity });
  });
});
