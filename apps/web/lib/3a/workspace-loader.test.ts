import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import type { ArchitectureScopeRef, KnowledgeProjectionEdge, ProjectionManifestV2 } from "@specforge/core";
import type { ThreeAProjectionQueryService } from "@specforge/knowledge-query";
import { loadThreeAWorkspaceData } from "./workspace-loader";
import type { ResolvedThreeARequest } from "./principal";
import type { ThreeAUrlState } from "./url-state";

const scope: ArchitectureScopeRef = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};
const request: ResolvedThreeARequest = {
  architectureScope: scope,
  principal: { actorType: "agent", actorId: "test", subject: "test", tenantId: "tenant", authSource: "seed", grants: [], permissions: ["knowledge:read"], decisionRef: "test" }
};
const baseline = { ...scope, id: "baseline-1", streamId: "stream-1", changeSetId: "change-1", status: "PUBLISHED" as const, publishedAt: "2026-08-10T00:00:00.000Z" };
const manifest = { id: "projection-1", profileVersion: "v1", publishedAt: "2026-08-10T00:00:00.000Z" } as ProjectionManifestV2;
const node = (layer: "BIZ" | "SYS" | "TECH", id: string) => ({ assertionId: id, semanticIdentity: id, layer, nodeKind: "domain", displayName: id, canonicalName: id, contentDigest: id, sourceFactId: id } as never);

function serviceMock() {
  const service = {
    listPublishedBaselines: vi.fn().mockResolvedValue([baseline]),
    listProjectionManifests: vi.fn().mockResolvedValue([manifest]),
    searchArchitectureFacts: vi.fn().mockImplementation(async ({ layer }: { layer: "BIZ" | "SYS" | "TECH" }) => ({ ...scope, baselineId: baseline.id, projectionManifestId: manifest.id, profileId: "profile", profileVersion: "v1", relationshipVersion: "r1", resultDigest: "digest", nodes: [node(layer, `${layer.toLowerCase()}-1`)] })),
    getArchitectureFactDetail: vi.fn().mockResolvedValue({ ...scope, baselineId: baseline.id, projectionManifestId: manifest.id, profileId: "profile", profileVersion: "v1", relationshipVersion: "r1", resultDigest: "digest", node: node("BIZ", "biz-1"), evidenceRefs: [], sourceObservationIds: [], unresolvedQuestions: [], counterEvidence: [], incoming: [], outgoing: [], warnings: [] }),
    traceArchitecturePath: vi.fn().mockResolvedValue({ ...scope, baselineId: baseline.id, projectionManifestId: manifest.id, profileId: "profile", profileVersion: "v1", relationshipVersion: "r1", resultDigest: "digest", nodes: [node("BIZ", "biz-1")], edges: [] as KnowledgeProjectionEdge[], paths: [] }),
    getArchitectureAlignment: vi.fn().mockResolvedValue({ ...scope, baselineId: baseline.id, projectionManifestId: manifest.id, profileId: "profile", profileVersion: "v1", relationshipVersion: "r1", resultDigest: "digest", edges: [{ ...scope, generationId: "generation-1", baselineId: baseline.id, relationshipIdentity: "biz-1:REALIZED_BY:sys-1", sourceAssertionId: "biz-1", targetAssertionId: "sys-1", sourceSemanticIdentity: "biz-1", targetSemanticIdentity: "sys-1", relationCode: "REALIZED_BY", confidence: 1, relationshipVersion: "r1", contentDigest: "edge-1" }], warnings: [] }),
    comparePublishedBaselines: vi.fn()
  } as unknown as ThreeAProjectionQueryService;
  return service;
}

function state(overrides: Partial<ThreeAUrlState>): ThreeAUrlState {
  return { scope: scope.applicationServiceId, baseline: baseline.id, projection: manifest.id, tab: "architecture", mode: "lanes", direction: "both", ...overrides };
}

describe("loadThreeAWorkspaceData", () => {
  it("loads three 20-node layer pages for lane mode and nothing else", async () => {
    const service = serviceMock();
    const result = await loadThreeAWorkspaceData(service, request, state({ mode: "lanes" }));
    expect(service.searchArchitectureFacts).toHaveBeenCalledTimes(3);
    expect(service.searchArchitectureFacts).toHaveBeenCalledWith(expect.objectContaining({ layer: "BIZ", limit: 20 }));
    expect(service.searchArchitectureFacts).toHaveBeenCalledWith(expect.objectContaining({ layer: "SYS", limit: 20 }));
    expect(service.searchArchitectureFacts).toHaveBeenCalledWith(expect.objectContaining({ layer: "TECH", limit: 20 }));
    expect(service.traceArchitecturePath).not.toHaveBeenCalled();
    expect(service.getArchitectureAlignment).not.toHaveBeenCalled();
    expect(service.comparePublishedBaselines).not.toHaveBeenCalled();
    expect(result.initialCatalog).toBeDefined();
  });

  it("loads bounded architecture facts and relationships for graph mode without focus", async () => {
    const service = serviceMock();
    const result = await loadThreeAWorkspaceData(service, request, state({ mode: "graph", focus: undefined }));
    expect(service.searchArchitectureFacts).toHaveBeenCalledTimes(3);
    expect(service.searchArchitectureFacts).toHaveBeenCalledWith(expect.objectContaining({ layer: "BIZ", limit: 84 }));
    expect(service.searchArchitectureFacts).toHaveBeenCalledWith(expect.objectContaining({ layer: "SYS", limit: 84 }));
    expect(service.searchArchitectureFacts).toHaveBeenCalledWith(expect.objectContaining({ layer: "TECH", limit: 84 }));
    expect(service.getArchitectureAlignment).toHaveBeenCalledWith(expect.objectContaining({ limit: 500 }));
    expect(result.initialGraphEdges).toHaveLength(1);
    expect(service.traceArchitecturePath).not.toHaveBeenCalled();
  });

  it("loads one bounded trace and detail for graph mode with focus", async () => {
    const service = serviceMock();
    await loadThreeAWorkspaceData(service, request, state({ mode: "graph", focus: "biz-1" }));
    expect(service.getArchitectureFactDetail).toHaveBeenCalledWith(expect.objectContaining({ assertionId: "biz-1" }));
    expect(service.traceArchitecturePath).toHaveBeenCalledWith(expect.objectContaining({ startAssertionId: "biz-1", budget: expect.objectContaining({ maxDepth: 1, maxNodes: 100, maxEdges: 200 }) }));
    expect(service.getArchitectureAlignment).not.toHaveBeenCalled();
    expect(service.comparePublishedBaselines).not.toHaveBeenCalled();
  });

  it("loads only the selected alignment or drift view", async () => {
    const alignmentService = serviceMock();
    await loadThreeAWorkspaceData(alignmentService, request, state({ tab: "alignment" }));
    expect(alignmentService.getArchitectureAlignment).toHaveBeenCalledTimes(1);
    expect(alignmentService.searchArchitectureFacts).not.toHaveBeenCalled();

    const driftService = serviceMock();
    await loadThreeAWorkspaceData(driftService, request, state({ tab: "drift" }));
    expect(driftService.searchArchitectureFacts).not.toHaveBeenCalled();
    expect(driftService.getArchitectureAlignment).not.toHaveBeenCalled();
  });

  it("does not regress to eager full-catalog or inactive-view loading", async () => {
    const page = await readFile(new URL("../../app/architecture/3a/page.tsx", import.meta.url), "utf8");
    expect(page).not.toContain("limit: 200");
    expect(page).not.toContain("const alignment = await service.getArchitectureAlignment");
    expect(page).not.toContain("const drift = await loadDrift");
  });
});
