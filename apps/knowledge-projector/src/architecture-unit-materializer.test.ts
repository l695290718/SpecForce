import { describe, expect, it } from "vitest";
import { contentDigest } from "@specforge/core";
import {
  ArchitectureUnitMaterializationError,
  materializeArchitectureUnits,
  type ArchitectureUnitMaterializationInput
} from "./architecture-unit-materializer.js";

const identity = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner",
  generationId: "generation-1",
  baselineId: "baseline-1",
  projectionManifestId: "projection-manifest:generation-1"
} as const;

function unit(overrides: Record<string, unknown> = {}) {
  return {
    sourceType: "architecture-unit" as const,
    ...identity,
    unitIdentity: "unit:biz:policy-evaluation",
    layer: "BIZ" as const,
    kind: "CAPABILITY" as const,
    canonicalName: "Policy Evaluation",
    localizedName: "策略评估",
    aliases: ["policy decision"],
    memberCount: 1,
    criticality: 0.8,
    completeness: 1,
    evidenceCount: 1,
    unclassifiedMemberCount: 0,
    contentDigest: "unit-digest",
    ...overrides
  };
}

function member(overrides: Record<string, unknown> = {}) {
  return {
    sourceType: "architecture-unit-member" as const,
    ...identity,
    unitIdentity: "unit:biz:policy-evaluation",
    assertionId: "assertion-policy",
    assetType: "businessRule",
    semanticIdentity: "policy.evaluation",
    contentDigest: "member-digest",
    ...overrides
  };
}

function mapping(overrides: Record<string, unknown> = {}) {
  const source = unit();
  const target = unit({ unitIdentity: "unit:sys:policy-service", layer: "SYS", kind: "SERVICE", canonicalName: "Policy Service" });
  return {
    sourceType: "architecture-unit-mapping" as const,
    ...identity,
    mappingIdentity: "mapping:policy-evaluation:policy-service",
    sourceUnitIdentity: source.unitIdentity,
    targetUnitIdentity: target.unitIdentity,
    sourceLayer: source.layer,
    targetLayer: target.layer,
    mappingFamily: "REALIZES",
    relationshipCount: 1,
    evidenceCount: 1,
    confidence: 0.9,
    contentDigest: "mapping-digest",
    sourceEndpoints: { source, target },
    ...overrides
  };
}

function input(overrides: Partial<ArchitectureUnitMaterializationInput> = {}): ArchitectureUnitMaterializationInput {
  const biz = unit();
  const sys = unit({ unitIdentity: "unit:sys:policy-service", layer: "SYS", kind: "SERVICE", canonicalName: "Policy Service", criticality: 0.6 });
  return { ...identity, units: [biz, sys], members: [member()], mappings: [mapping({ sourceEndpoints: { source: biz, target: sys } })], ...overrides };
}

describe("architecture unit materializer", () => {
  it("builds explicit units, members, and mappings in stable order", () => {
    const result = materializeArchitectureUnits(input());
    expect(result.units.map((item) => item.unitIdentity)).toEqual(["unit:biz:policy-evaluation", "unit:sys:policy-service"]);
    expect(result.members.map((item) => item.assertionId)).toEqual(["assertion-policy"]);
    expect(result.mappings.map((item) => item.mappingIdentity)).toEqual(["mapping:policy-evaluation:policy-service"]);
    expect(result.contentDigest).toBe(contentDigest({ architectureScope: { applicationServiceId: identity.applicationServiceId, scopePath: identity.scopePath }, generationId: identity.generationId, baselineId: identity.baselineId, projectionManifestId: identity.projectionManifestId, units: result.units, members: result.members, mappings: result.mappings }));
  });

  it.each([
    ["cross Scope", () => input({ members: [member({ scopePath: "other/scope" })] }), "ARCHITECTURE_UNIT_SCOPE_MISMATCH"],
    ["missing English", () => input({ units: [unit({ canonicalName: " " }), unit({ unitIdentity: "unit:sys:policy-service", layer: "SYS", kind: "SERVICE", canonicalName: "Policy Service" })] }), "ARCHITECTURE_UNIT_ENGLISH_REQUIRED"],
    ["invalid layer-kind", () => input({ units: [unit({ kind: "SERVICE" }), unit({ unitIdentity: "unit:sys:policy-service", layer: "SYS", kind: "SERVICE", canonicalName: "Policy Service" })] }), "ARCHITECTURE_UNIT_INVALID_KIND"],
    ["missing mapping endpoint", () => input({ mappings: [mapping({ sourceEndpoints: undefined })] }), "ARCHITECTURE_UNIT_ENDPOINT_UNRESOLVED"]
  ])("rejects %s", (_name, build, code) => {
    expect(() => materializeArchitectureUnits(build())).toThrowError(new ArchitectureUnitMaterializationError(code));
  });

  it("returns the same order and digest for repeated input", () => {
    const first = materializeArchitectureUnits(input());
    const second = materializeArchitectureUnits(input());
    expect(second).toEqual(first);
  });
});
