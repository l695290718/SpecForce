import { describe, expect, it, vi } from "vitest";
import type { KnowledgeProjectionEdge, KnowledgeProjectionNode } from "@specforge/core";
import { createThreeAProjectionQueryService } from "./service";
import type { CursorKeyring } from "./cursor";
import type { ArchitectureFactSource, ThreeAQueryRepository, TraceArchitecturePathInput, TraceContinuationStore } from "./types";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const principal = { actorType: "agent" as const, actorId: "agent-a", subject: "agent-a", tenantId: "tenant-a", authSource: "static-bearer" as const, permissions: ["knowledge:read" as const], decisionRef: "decision-a", grants: [{ scopeId: scope.applicationServiceId, action: "read" as const }] };
const manifest = { ...scope, id: "manifest-1", baselineId: "baseline-1", generationId: "generation-1", profileId: "generic-system", profileVersion: "1", projectionSchemaVersion: "3a.v2" as const, sourceRevisionIds: ["a-1"], relationshipVersion: "r1", query: {}, inputDigest: "input", contentDigest: "content", nodeCount: 1, edgeCount: 0, publishedAt: "2026-08-10T00:00:00.000Z" };
const repository: ThreeAQueryRepository = { listOfficialBaselines: vi.fn().mockResolvedValue([]), listPublishedManifests: vi.fn().mockResolvedValue([manifest]), searchNodes: vi.fn().mockResolvedValue({ nodes: [], hasMore: false }), getFact: vi.fn(), getFactsByIds: vi.fn().mockResolvedValue([]), listAdjacentEdges: vi.fn().mockResolvedValue({ edges: [], hasMore: false }), listEdges: vi.fn().mockResolvedValue([]) };
const store: TraceContinuationStore = { create: vi.fn(), consume: vi.fn() };
const keyring: CursorKeyring = { activeKeyId: "k1", keys: { k1: Buffer.from("test-key") } };

function node(assertionId: string, layer: "BIZ" | "SYS" | "TECH", semanticIdentity: string): KnowledgeProjectionNode {
  return { ...scope, generationId: manifest.generationId, baselineId: manifest.baselineId, assertionId, layer, semanticIdentity, sortKey: `${layer}|${semanticIdentity}`, contentDigest: `digest-${assertionId}` };
}

function edge(sourceNode: KnowledgeProjectionNode, targetNode: KnowledgeProjectionNode, relationCode: string): KnowledgeProjectionEdge {
  return { ...scope, generationId: manifest.generationId, baselineId: manifest.baselineId, relationshipIdentity: `${sourceNode.assertionId}:${relationCode}:${targetNode.assertionId}`, sourceAssertionId: sourceNode.assertionId, targetAssertionId: targetNode.assertionId, sourceSemanticIdentity: sourceNode.semanticIdentity, targetSemanticIdentity: targetNode.semanticIdentity, relationCode, confidence: 1, relationshipVersion: manifest.relationshipVersion, contentDigest: `digest-${relationCode}` };
}

function source(factNode: KnowledgeProjectionNode): ArchitectureFactSource {
  return { node: factNode, evidenceRefs: [], sourceObservationIds: [], unresolvedQuestions: [], counterEvidence: [] };
}

function traceInput(overrides: Partial<TraceArchitecturePathInput> = {}): TraceArchitecturePathInput {
  return { principal, architectureScope: scope, baselineId: manifest.baselineId, projectionManifestId: manifest.id, startAssertionId: "biz-1", direction: "downstream", budget: { maxDepth: 1, maxNodes: 100, maxEdges: 200 }, ...overrides };
}

describe("3A query service", () => {
  it("authorizes exact Scope before checking Baseline existence", async () => { const service = createThreeAProjectionQueryService(repository, store, keyring); const unauthorized = { ...principal, grants: [] }; await expect(service.listPublishedBaselines({ principal: unauthorized, architectureScope: scope })).rejects.toMatchObject({ code: "SCOPE_ACCESS_DENIED" }); expect(repository.listOfficialBaselines).not.toHaveBeenCalled(); });
  it("keeps an authorized empty catalog scoped and deterministic", async () => { const service = createThreeAProjectionQueryService(repository, store, keyring); await expect(service.searchArchitectureFacts({ principal, architectureScope: scope, baselineId: "baseline-1", projectionManifestId: "manifest-1" })).resolves.toMatchObject({ applicationServiceId: scope.applicationServiceId, nodes: [] }); });

  it("walks only bounded adjacency and binds filters to continuation state", async () => {
    const biz = node("biz-1", "BIZ", "orders.intent");
    const sys = node("sys-1", "SYS", "orders.api");
    const tech = node("tech-1", "TECH", "orders.postgres");
    repository.listAdjacentEdges = vi.fn().mockResolvedValue({ edges: [edge(biz, sys, "REALIZED_BY"), edge(sys, tech, "DEPENDS_ON")], hasMore: false });
    repository.getFactsByIds = vi.fn().mockResolvedValue([source(biz), source(sys), source(tech)]);
    const service = createThreeAProjectionQueryService(repository, store, keyring);

    const result = await service.traceArchitecturePath(traceInput({ relationTypes: ["REALIZED_BY"], layers: ["BIZ", "SYS"] }));

    expect(repository.listAdjacentEdges).toHaveBeenCalledWith(scope, manifest, { frontierAssertionIds: [biz.assertionId], direction: "downstream", relationTypes: ["REALIZED_BY"], limit: 200 });
    expect(repository.listEdges).not.toHaveBeenCalled();
    expect(result.nodes.map((item) => item.assertionId)).toEqual(["biz-1", "sys-1"]);
    expect(result.edges.map((item) => item.relationCode)).toEqual(["REALIZED_BY"]);
  });

  it("rejects a continuation when relation or layer filters change", async () => {
    const biz = node("biz-1", "BIZ", "orders.intent");
    const sys = node("sys-1", "SYS", "orders.api");
    repository.listAdjacentEdges = vi.fn().mockResolvedValue({ edges: [edge(biz, sys, "REALIZED_BY")], hasMore: false });
    repository.getFactsByIds = vi.fn().mockResolvedValue([source(biz), source(sys)]);
    const service = createThreeAProjectionQueryService(repository, store, keyring);
    const first = await service.traceArchitecturePath(traceInput({ relationTypes: ["REALIZED_BY"], layers: ["BIZ", "SYS"] }));

    await expect(service.traceArchitecturePath(traceInput({ relationTypes: ["DEPENDS_ON"], layers: ["SYS", "TECH"], continuation: first.continuation }))).rejects.toMatchObject({ code: "CURSOR_INVALID" });
  });
});
