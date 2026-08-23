import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ArchitectureMapBudget,
  ArchitectureUnitMappingProjection,
  ArchitectureUnitMemberProjection,
  ArchitectureUnitProjection,
  KnowledgeProjectionEdge
} from "@specforge/core";
import type { CursorKeyring } from "./cursor";
import { createThreeAProjectionQueryService } from "./service";
import type {
  ArchitectureMapQueryRepository,
  ArchitectureUnitPageCursor,
  ThreeAQueryRepository,
  TraceContinuationStore
} from "./types";

const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};
const otherScope = {
  applicationServiceId: "com.huawei.celon.policyhub",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-policyhub/com.huawei.celon.policyhub"
};
const principal = {
  actorType: "agent" as const,
  actorId: "agent-a",
  subject: "agent-a",
  tenantId: "tenant-a",
  authSource: "static-bearer" as const,
  permissions: ["knowledge:read" as const],
  decisionRef: "decision-a",
  grants: [{ scopeId: scope.applicationServiceId, action: "read" as const }]
};
const manifest = {
  ...scope,
  id: "manifest-1",
  baselineId: "baseline-1",
  generationId: "generation-1",
  profileId: "generic-system",
  profileVersion: "1",
  projectionSchemaVersion: "3a.v2" as const,
  sourceRevisionIds: ["a-1"],
  relationshipVersion: "r1",
  query: {},
  inputDigest: "input",
  contentDigest: "content",
  nodeCount: 4,
  edgeCount: 1,
  publishedAt: "2026-08-10T00:00:00.000Z"
};
const store: TraceContinuationStore = { create: vi.fn(), consume: vi.fn() };
const keyring: CursorKeyring = { activeKeyId: "k1", keys: { k1: Buffer.from("test-key") } };

function unit(identity: string, layer: "BIZ" | "SYS" | "TECH", overrides: Partial<ArchitectureUnitProjection> = {}): ArchitectureUnitProjection {
  return {
    ...scope,
    generationId: manifest.generationId,
    baselineId: manifest.baselineId,
    projectionManifestId: manifest.id,
    unitIdentity: identity,
    layer,
    kind: layer === "BIZ" ? "CAPABILITY" : layer === "SYS" ? "SERVICE" : "PLATFORM",
    canonicalName: identity,
    aliases: [],
    memberCount: 1,
    criticality: 0.5,
    completeness: 1,
    evidenceCount: 1,
    unclassifiedMemberCount: 0,
    contentDigest: `digest-${identity}`,
    ...overrides
  };
}

function member(unitIdentity: string, assertionId: string, assetType = "api"): ArchitectureUnitMemberProjection {
  return {
    ...scope,
    generationId: manifest.generationId,
    baselineId: manifest.baselineId,
    projectionManifestId: manifest.id,
    unitIdentity,
    assertionId,
    assetType,
    semanticIdentity: assertionId,
    contentDigest: `digest-${assertionId}`
  };
}

function mapping(source: ArchitectureUnitProjection, target: ArchitectureUnitProjection, family = "REALIZATION"): ArchitectureUnitMappingProjection {
  return {
    ...scope,
    generationId: manifest.generationId,
    baselineId: manifest.baselineId,
    projectionManifestId: manifest.id,
    mappingIdentity: `${source.unitIdentity}:${family}:${target.unitIdentity}`,
    sourceUnitIdentity: source.unitIdentity,
    targetUnitIdentity: target.unitIdentity,
    sourceLayer: source.layer,
    targetLayer: target.layer,
    mappingFamily: family,
    relationshipCount: 1,
    evidenceCount: 1,
    confidence: 0.9,
    contentDigest: `digest-${source.unitIdentity}-${target.unitIdentity}`
  };
}

function dependency(sourceAssertionId: string, targetAssertionId: string): KnowledgeProjectionEdge {
  return {
    ...scope,
    generationId: manifest.generationId,
    baselineId: manifest.baselineId,
    relationshipIdentity: `${sourceAssertionId}:DEPENDS_ON:${targetAssertionId}`,
    sourceAssertionId,
    targetAssertionId,
    sourceSemanticIdentity: sourceAssertionId,
    targetSemanticIdentity: targetAssertionId,
    relationCode: "DEPENDS_ON",
    confidence: 1,
    relationshipVersion: manifest.relationshipVersion,
    contentDigest: `digest-${sourceAssertionId}-${targetAssertionId}`
  };
}

function repositories() {
  const base: ThreeAQueryRepository = {
    listOfficialBaselines: vi.fn().mockResolvedValue([]),
    listPublishedManifests: vi.fn().mockResolvedValue([manifest]),
    searchNodes: vi.fn().mockResolvedValue({ nodes: [], hasMore: false }),
    getFact: vi.fn(),
    getFactsByIds: vi.fn().mockResolvedValue([]),
    listAdjacentEdges: vi.fn().mockResolvedValue({ edges: [], hasMore: false }),
    listEdges: vi.fn().mockResolvedValue([])
  };
  const map: ArchitectureMapQueryRepository = {
    listArchitectureUnits: vi.fn().mockResolvedValue({
      units: [],
      totalByLayer: { BIZ: 0, SYS: 0, TECH: 0 },
      unclassifiedCount: 0,
      nextCursor: undefined
    }),
    getArchitectureUnitsByIdentity: vi.fn().mockResolvedValue([]),
    listArchitectureUnitMembers: vi.fn().mockResolvedValue({ members: [], hasMore: false }),
    listArchitectureUnitMembersByUnits: vi.fn().mockResolvedValue({ members: [], hasMore: false }),
    listArchitectureUnitMemberRelationships: vi.fn().mockResolvedValue({ edges: [], hasMore: false }),
    listArchitectureUnitMappings: vi.fn().mockResolvedValue({ mappings: [], hasMore: false }),
    listArchitectureUnitNeighborhoodMappings: vi.fn().mockResolvedValue({ mappings: [], hasMore: false }),
    listSameLayerDependencies: vi.fn().mockResolvedValue({ edges: [], hasMore: false })
  };
  return { base: Object.assign(base, map), map };
}

function mapInput(overrides: Record<string, unknown> = {}) {
  return {
    principal,
    architectureScope: scope,
    generationId: manifest.generationId,
    baselineId: manifest.baselineId,
    projectionManifestId: manifest.id,
    filter: {},
    ...overrides
  };
}

beforeEach(() => vi.clearAllMocks());

describe("bounded readable 3A architecture queries", () => {
  it("enforces exact identity, default limits, deterministic ordering, and summary metrics", async () => {
    const { base, map } = repositories();
    const biz = unit("unit:biz", "BIZ", { canonicalName: "Order", criticality: 0.9 });
    const sysB = unit("unit:sys-b", "SYS", { canonicalName: "Billing", criticality: 0.7, evidenceCount: 0 });
    const sysA = unit("unit:sys-a", "SYS", { canonicalName: "Account", criticality: 0.7, unclassifiedMemberCount: 1 });
    const tech = unit("unit:tech", "TECH", { canonicalName: "Postgres" });
    vi.mocked(map.listArchitectureUnits).mockResolvedValue({
      units: [tech, sysB, biz, sysA],
      totalByLayer: { BIZ: 1, SYS: 2, TECH: 1 },
      unclassifiedCount: 1,
      nextCursor: undefined
    });
    vi.mocked(map.listArchitectureUnitMappings).mockResolvedValue({ mappings: [mapping(sysA, tech), mapping(biz, sysA)], hasMore: false });
    const service = createThreeAProjectionQueryService(base, store, keyring);

    const result = await service.architectureMap(mapInput());

    expect(map.listArchitectureUnits).toHaveBeenCalledWith(
      expect.objectContaining({ ...scope, generationId: manifest.generationId, baselineId: manifest.baselineId, projectionManifestId: manifest.id }),
      {},
      { maxUnitsPerLayer: 12, maxMappings: 60, timeoutMs: 2_000, maxPayloadBytes: 512_000 },
      { BIZ: 0, SYS: 0, TECH: 0 }
    );
    expect(result.units.map((item) => item.unitIdentity)).toEqual(["unit:biz", "unit:sys-a", "unit:sys-b", "unit:tech"]);
    expect(result.mappings.map((item) => item.mappingIdentity)).toEqual([
      "unit:biz:REALIZATION:unit:sys-a",
      "unit:sys-a:REALIZATION:unit:tech"
    ]);
    expect(result.returnedByLayer).toEqual({ BIZ: 1, SYS: 2, TECH: 1 });
    expect(result.totalByLayer).toEqual({ BIZ: 1, SYS: 2, TECH: 1 });
    expect(result).toMatchObject({ unclassifiedCount: 1, mappingCompleteness: 0.75, evidenceCoverage: 0.833333 });
    expect(result.resultDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a generation mismatch before reading architecture units", async () => {
    const { base, map } = repositories();
    const service = createThreeAProjectionQueryService(base, store, keyring);
    await expect(service.architectureMap(mapInput({ generationId: "generation-other" }))).rejects.toMatchObject({ code: "ARCHITECTURE_MAP_QUERY_INVALID" });
    expect(map.listArchitectureUnits).not.toHaveBeenCalled();
  });

  it("bounds hard limits and emits an identity-bound continuation for partial pages", async () => {
    const { base, map } = repositories();
    const biz = unit("unit:biz", "BIZ");
    vi.mocked(map.listArchitectureUnits).mockResolvedValue({
      units: [biz],
      totalByLayer: { BIZ: 20, SYS: 0, TECH: 0 },
      unclassifiedCount: 0,
      nextCursor: { BIZ: 12, SYS: 0, TECH: 0 }
    });
    const service = createThreeAProjectionQueryService(base, store, keyring);
    const first = await service.architectureMap(mapInput({ budget: { maxUnitsPerLayer: 12 } }));
    expect(first.partial).toEqual({ code: "RESULT_PARTIAL", reasons: ["CONTINUATION_REQUIRED", "UNIT_BUDGET_EXCEEDED"] });
    expect(first.continuation).toBeTruthy();

    await expect(service.architectureMap(mapInput({ filter: { query: "changed" }, continuation: first.continuation }))).rejects.toMatchObject({ code: "CURSOR_INVALID" });
    await expect(service.architectureMap(mapInput({ budget: { maxUnitsPerLayer: 13 } }))).rejects.toMatchObject({ code: "QUERY_BUDGET_INVALID" });
  });

  it("returns a finite neighborhood with adjacent units, members, dependencies, and evidence", async () => {
    const { base, map } = repositories();
    const biz = unit("unit:biz", "BIZ");
    const sys = unit("unit:sys", "SYS");
    const tech = unit("unit:tech", "TECH");
    const bizToSys = mapping(biz, sys);
    const sysToTech = mapping(sys, tech, "DEPLOYMENT");
    vi.mocked(map.getArchitectureUnitsByIdentity)
      .mockResolvedValueOnce([sys])
      .mockResolvedValueOnce([biz, tech]);
    vi.mocked(map.listArchitectureUnitNeighborhoodMappings)
      .mockResolvedValueOnce({ mappings: [bizToSys, sysToTech], hasMore: false });
    vi.mocked(map.listArchitectureUnitMembers).mockResolvedValue({ members: [member(sys.unitIdentity, "assertion:api"), member(sys.unitIdentity, "assertion:model", "dataModel")], hasMore: false });
    vi.mocked(map.listSameLayerDependencies).mockResolvedValue({ edges: [dependency("assertion:api", "assertion:model")], hasMore: false });
    const service = createThreeAProjectionQueryService(base, store, keyring);

    const result = await service.architectureUnitNeighborhood({
      ...mapInput(),
      unitIdentity: sys.unitIdentity,
      direction: "both",
      depth: 1
    });

    expect(result.unit.unitIdentity).toBe(sys.unitIdentity);
    expect(result.adjacentUnits.map((item) => item.unitIdentity)).toEqual([biz.unitIdentity, tech.unitIdentity]);
    expect(result.members.map((item) => item.assertionId)).toEqual(["assertion:api", "assertion:model"]);
    expect(result.mappings.map((item) => item.mappingIdentity)).toEqual([bizToSys.mappingIdentity, sysToTech.mappingIdentity]);
    expect(result.sameLayerDependencies).toHaveLength(1);
    expect(result.evidenceRefs).toEqual(expect.arrayContaining([sys.contentDigest, bizToSys.contentDigest, "digest-assertion:api"]));
    expect(map.listArchitectureUnitNeighborhoodMappings).toHaveBeenCalledTimes(1);
  });

  it("returns governed members and membership edges only when unit graph member mode is requested", async () => {
    const { base, map } = repositories();
    const biz = unit("unit:biz", "BIZ");
    const sys = unit("unit:sys", "SYS");
    vi.mocked(map.listArchitectureUnits).mockResolvedValue({ units: [biz, sys], totalByLayer: { BIZ: 1, SYS: 1, TECH: 0 }, unclassifiedCount: 0 });
    vi.mocked(map.listArchitectureUnitMappings).mockResolvedValue({ mappings: [mapping(biz, sys)], hasMore: false });
    vi.mocked(map.listArchitectureUnitMembersByUnits).mockResolvedValue({ members: [member(biz.unitIdentity, "assertion:biz"), member(sys.unitIdentity, "assertion:sys")], hasMore: false });
    const service = createThreeAProjectionQueryService(base, store, keyring);

    const compatible = await service.unitGraph(mapInput());
    const withMembers = await service.unitGraph(mapInput({ includeMembers: true, budget: { maxMembers: 500 } }));

    expect(compatible).toMatchObject({ fidelity: "UNIT" });
    expect(compatible.nodes).toHaveLength(2);
    expect(withMembers).toMatchObject({ fidelity: "UNIT_WITH_MEMBERS" });
    expect(withMembers.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(["unit:biz", "assertion:biz", "assertion:sys"]));
    expect(withMembers.edges.map((edge) => edge.id)).toEqual(expect.arrayContaining(["membership:unit:biz:assertion:biz", "membership:unit:sys:assertion:sys"]));
    expect(map.listArchitectureUnitMembersByUnits).toHaveBeenCalledWith(expect.objectContaining(scope), ["unit:biz", "unit:sys"], 500);
  });

  it("does not leak a unit from another Scope", async () => {
    const { base, map } = repositories();
    vi.mocked(map.getArchitectureUnitsByIdentity).mockResolvedValue([]);
    const service = createThreeAProjectionQueryService(base, store, keyring);
    await expect(service.architectureUnitNeighborhood({
      ...mapInput(),
      unitIdentity: "unit:other-scope",
      direction: "both",
      depth: 1
    })).rejects.toMatchObject({ code: "ARCHITECTURE_UNIT_NOT_FOUND" });
    expect(map.getArchitectureUnitsByIdentity).toHaveBeenCalledWith(expect.objectContaining(scope), ["unit:other-scope"]);
    expect(map.getArchitectureUnitsByIdentity).not.toHaveBeenCalledWith(expect.objectContaining(otherScope), expect.anything());
  });

  it("rejects unauthorized Scope before any map repository read", async () => {
    const { base, map } = repositories();
    const service = createThreeAProjectionQueryService(base, store, keyring);
    await expect(service.architectureMap(mapInput({ principal: { ...principal, grants: [] } }))).rejects.toMatchObject({ code: "SCOPE_ACCESS_DENIED" });
    expect(map.listArchitectureUnits).not.toHaveBeenCalled();
  });
});
