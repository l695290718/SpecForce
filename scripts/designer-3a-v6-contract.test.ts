import { describe, expect, it } from "vitest";
import type { Designer3aCandidateEvidence, Designer3aV5Snapshot } from "./designer-3a-v6-contract";
import { buildDesigner3aV6Snapshot, V6_UNIT_IDENTITIES } from "./designer-3a-v6-contract";

function fixtureV5Snapshot(): Designer3aV5Snapshot {
  const units = [
    ["unit:biz:specforge-governed-design-facts", "BIZ", "CAPABILITY"],
    ["unit:sys:specforge-mcp-governance-gateway", "SYS", "SERVICE"],
    ["unit:sys:specforge-3a-projection-service", "SYS", "SERVICE"],
    ["unit:tech:specforge-postgresql-authority", "TECH", "TECHNOLOGY_SERVICE"]
  ].map(([unitIdentity, layer, kind]) => ({ id: `${unitIdentity}:v5`, unitIdentity, revision: 5, layer, kind, ...(unitIdentity.startsWith("unit:biz") ? {} : { parentUnitIdentity: "unit:biz:specforge-governed-design-facts" }), canonicalName: unitIdentity, canonicalDescription: unitIdentity, localizedContent: { zh: { name: unitIdentity, description: unitIdentity } }, aliases: [], criticality: 1, evidenceRefs: [unitIdentity] })) as Designer3aV5Snapshot["units"];
  const memberships = Array.from({ length: 38 }, (_, index) => ({ id: `membership:${index}:v5`, membershipIdentity: `membership:${index}`, revision: 5, unitIdentity: index === 0 ? "unit:biz:specforge-governed-design-facts" : index < 8 ? "unit:sys:specforge-mcp-governance-gateway" : index < 28 ? "unit:sys:specforge-3a-projection-service" : "unit:tech:specforge-postgresql-authority", assetType: "api", assetId: index === 28 ? "data-specforge-ai-generation" : index === 29 ? "data-specforge-asset-graph" : index === 30 ? "data-specforge-audit" : `asset-${index}`, semanticIdentity: `asset-${index}`, confidence: 1, evidenceRefs: ["v5"] }));
  const mappings = [
    ["unit:biz:specforge-governed-design-facts", "unit:sys:specforge-mcp-governance-gateway"],
    ["unit:sys:specforge-mcp-governance-gateway", "unit:tech:specforge-postgresql-authority"],
    ["unit:sys:specforge-3a-projection-service", "unit:tech:specforge-postgresql-authority"]
  ].map(([sourceUnitIdentity, targetUnitIdentity], index) => ({ id: `mapping:${index}:v5`, mappingIdentity: `mapping:${index}`, revision: 5, sourceUnitIdentity, targetUnitIdentity, mappingFamily: "SERVICE_TO_TECHNOLOGY", confidence: 1, relationshipIdentities: [`relationship:${index}`], evidenceRefs: ["v5"] }));
  return { units, memberships, mappings };
}

function fixtureCandidates(overrides: Partial<Record<"omitGraphEvidence", boolean>> = {}): Designer3aCandidateEvidence[] {
  const base = [
    ["api", "api-specforge-ai-generation", ["READS", "WRITES"]],
    ["api", "api-specforge-graph-query", ["READS"]],
    ["api", "api-specforge-web-console", ["CALLS"]],
    ["observability", "obs-specforge-mcp-audit", ["OBSERVES"]]
  ] as const;
  return base.map(([assetType, assetId, relationshipCodes]) => ({ assetType, assetId, relationshipCodes: [...relationshipCodes], relationshipIdentities: overrides.omitGraphEvidence && assetId === "api-specforge-graph-query" ? [] : [`relationship:${assetId}`], evidenceRefs: [`asset:${assetId}`] }));
}

describe("Designer 3A v6 contract", () => {
  it("carries v5 and adds exactly four units, four memberships, and three mappings", () => {
    const result = buildDesigner3aV6Snapshot({ v5: fixtureV5Snapshot(), candidates: fixtureCandidates() });
    expect(result.units).toHaveLength(8);
    expect(result.memberships).toHaveLength(42);
    expect(result.mappings).toHaveLength(6);
    expect(result.units.map((item) => item.unitIdentity)).toEqual(expect.arrayContaining(Object.values(V6_UNIT_IDENTITIES)));
  });

  it("keeps Web Console calls out of cross-layer mappings", () => {
    const result = buildDesigner3aV6Snapshot({ v5: fixtureV5Snapshot(), candidates: fixtureCandidates() });
    expect(result.mappings.some((item) => item.sourceUnitIdentity === V6_UNIT_IDENTITIES.webConsole)).toBe(false);
  });

  it("rejects a missing relationship or missing target membership", () => {
    expect(() => buildDesigner3aV6Snapshot({ v5: fixtureV5Snapshot(), candidates: fixtureCandidates({ omitGraphEvidence: true }) })).toThrow("V6_REQUIRED_EVIDENCE_MISSING");
    const v5 = fixtureV5Snapshot();
    v5.memberships = v5.memberships.filter((membership) => membership.assetId !== "data-specforge-audit");
    expect(() => buildDesigner3aV6Snapshot({ v5, candidates: fixtureCandidates() })).toThrow("V5_SNAPSHOT_COUNT_MISMATCH");
  });

  it("requires complete bilingual unit content and stable direct membership", () => {
    const result = buildDesigner3aV6Snapshot({ v5: fixtureV5Snapshot(), candidates: fixtureCandidates() });
    for (const unit of result.units.slice(-4)) {
      expect(unit.canonicalName).toBeTruthy();
      expect(unit.localizedContent.zh.name).toBeTruthy();
      expect(unit.localizedContent.zh.description).toBeTruthy();
    }
    expect(result.memberships.filter((item) => item.assetId === "api-specforge-web-console")).toHaveLength(1);
  });
});
