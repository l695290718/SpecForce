import { describe, expect, it } from "vitest";
import {
  DEFAULT_ARCHITECTURE_MAP_BUDGET,
  validateArchitectureMapBudget,
  validateArchitectureUnit,
  validateArchitectureUnitMapping,
  validateArchitectureUnitMember,
  type ArchitectureUnitMappingProjection,
  type ArchitectureUnitProjection,
  type ArchitectureUnitMemberProjection
} from "./types";

const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

const projection = {
  ...scope,
  generationId: "generation-1",
  baselineId: "baseline-1",
  projectionManifestId: "projection-manifest:generation-1"
};

function unit(overrides: Partial<ArchitectureUnitProjection> = {}): ArchitectureUnitProjection {
  return {
    ...projection,
    unitIdentity: "unit:biz:policy-evaluation",
    layer: "BIZ",
    kind: "CAPABILITY",
    canonicalName: "Policy Evaluation",
    localizedName: "策略评估",
    aliases: ["policy decision"],
    memberCount: 2,
    criticality: 0.8,
    completeness: 1,
    evidenceCount: 2,
    unclassifiedMemberCount: 0,
    contentDigest: "unit-digest",
    ...overrides
  };
}

function member(overrides: Partial<ArchitectureUnitMemberProjection> = {}): ArchitectureUnitMemberProjection {
  return {
    ...projection,
    unitIdentity: "unit:biz:policy-evaluation",
    assertionId: "assertion:policy-evaluation",
    assetType: "business-rule",
    semanticIdentity: "semantic:policy-evaluation",
    contentDigest: "member-digest",
    ...overrides
  };
}

function mapping(overrides: Partial<ArchitectureUnitMappingProjection> = {}): ArchitectureUnitMappingProjection {
  return {
    ...projection,
    mappingIdentity: "mapping:policy-evaluation:policy-service",
    sourceUnitIdentity: "unit:biz:policy-evaluation",
    targetUnitIdentity: "unit:sys:policy-service",
    sourceLayer: "BIZ",
    targetLayer: "SYS",
    mappingFamily: "REALIZES",
    relationshipCount: 2,
    evidenceCount: 2,
    confidence: 0.9,
    contentDigest: "mapping-digest",
    ...overrides
  };
}

describe("architecture-map contracts", () => {
  it("validates BIZ, SYS, and TECH units plus scoped membership and mapping", () => {
    const biz = validateArchitectureUnit(unit());
    const sys = validateArchitectureUnit(unit({ unitIdentity: "unit:sys:policy-service", layer: "SYS", kind: "SERVICE", canonicalName: "Policy Service" }));
    const tech = validateArchitectureUnit(unit({ unitIdentity: "unit:tech:policy-platform", layer: "TECH", kind: "PLATFORM", canonicalName: "Policy Platform" }));
    const acceptedMember = validateArchitectureUnitMember(member());
    const acceptedMapping = validateArchitectureUnitMapping(mapping(), { source: biz, target: sys });

    expect(biz.unitIdentity).toBe("unit:biz:policy-evaluation");
    expect(sys.layer).toBe("SYS");
    expect(tech.kind).toBe("PLATFORM");
    expect(acceptedMember.unitIdentity).toBe(biz.unitIdentity);
    expect(acceptedMapping.targetUnitIdentity).toBe(sys.unitIdentity);
  });

  it("rejects an invalid layer-kind pair and an empty English canonical name", () => {
    expect(() => validateArchitectureUnit(unit({ layer: "BIZ", kind: "SERVICE" }))).toThrow("ARCHITECTURE_UNIT_KIND_LAYER_MISMATCH");
    expect(() => validateArchitectureUnit(unit({ canonicalName: "  " }))).toThrow("ARCHITECTURE_UNIT_CANONICAL_NAME_REQUIRED");
  });

  it("rejects missing mapping endpoints and cross-Scope endpoints", () => {
    const source = unit();
    const target = unit({ unitIdentity: "unit:sys:policy-service", layer: "SYS", kind: "SERVICE", canonicalName: "Policy Service" });
    expect(() => validateArchitectureUnitMapping(mapping())).toThrow("ARCHITECTURE_UNIT_MAPPING_SOURCE_ENDPOINT_MISSING");
    expect(() => validateArchitectureUnitMapping(mapping(), { source, target: { ...target, scopePath: `${scope.scopePath}/other` } })).toThrow("ARCHITECTURE_UNIT_MAPPING_SCOPE_MISMATCH");
  });

  it("validates the bounded default map budget", () => {
    expect(validateArchitectureMapBudget(DEFAULT_ARCHITECTURE_MAP_BUDGET)).toEqual(DEFAULT_ARCHITECTURE_MAP_BUDGET);
    expect(() => validateArchitectureMapBudget({ ...DEFAULT_ARCHITECTURE_MAP_BUDGET, maxMappings: 0 })).toThrow("ARCHITECTURE_MAP_MAPPING_BUDGET_INVALID");
  });
});
