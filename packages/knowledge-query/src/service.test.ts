import { describe, expect, it, vi } from "vitest";
import type { KnowledgeProjectionEdge, KnowledgeProjectionNode } from "@specforge/core";
import { createThreeAProjectionQueryService } from "./service";
import type { CursorKeyring } from "./cursor";
import type { GraphAnalysisRepository } from "./graph-analysis-repository";
import type { ArchitectureFactSource, ImpactArchitectureInput, OverviewArchitectureInput, ThreeAQueryRepository, TraceArchitecturePathInput, TraceContinuationStore } from "./types";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const principal = { actorType: "agent" as const, actorId: "agent-a", subject: "agent-a", tenantId: "tenant-a", authSource: "static-bearer" as const, permissions: ["knowledge:read" as const], decisionRef: "decision-a", grants: [{ scopeId: scope.applicationServiceId, action: "read" as const }] };
const manifest = { ...scope, id: "manifest-1", baselineId: "baseline-1", generationId: "generation-1", profileId: "generic-system", profileVersion: "1", projectionSchemaVersion: "3a.v2" as const, sourceRevisionIds: ["a-1"], relationshipVersion: "r1", query: {}, inputDigest: "input", contentDigest: "content", nodeCount: 1, edgeCount: 0, publishedAt: "2026-08-10T00:00:00.000Z" };
const repository: ThreeAQueryRepository = { listOfficialBaselines: vi.fn().mockResolvedValue([]), listPublishedManifests: vi.fn().mockResolvedValue([manifest]), searchNodes: vi.fn().mockResolvedValue({ nodes: [], hasMore: false }), getFact: vi.fn(), getFactsByIds: vi.fn().mockResolvedValue([]), listAdjacentEdges: vi.fn().mockResolvedValue({ edges: [], hasMore: false }), listEdges: vi.fn().mockResolvedValue([]) };
const store: TraceContinuationStore = { create: vi.fn(), consume: vi.fn() };
const keyring: CursorKeyring = { activeKeyId: "k1", keys: { k1: Buffer.from("test-key") } };
const analysis = { ...scope, id: "analysis-1", generationId: manifest.generationId, baselineId: manifest.baselineId, projectionManifestId: manifest.id, analysisVersion: "graph-analysis-v1", policyVersion: "impact-v1", sourceContentDigest: manifest.contentDigest, relationshipVersion: manifest.relationshipVersion, contentDigest: "analysis-digest" };
const graphRepository = {
  upsertAnalysis: vi.fn(), upsertClusters: vi.fn(), upsertNodeMetrics: vi.fn(),
  loadOverview: vi.fn().mockResolvedValue({ availability: "READY", analysis, nodes: [], edges: [], partialReasons: [] }),
  loadImpact: vi.fn().mockResolvedValue({ availability: "READY", analysis, edges: [], metrics: [], partialReasons: [] }),
  loadNodeMetrics: vi.fn(), loadClusterMembers: vi.fn()
} as unknown as GraphAnalysisRepository;

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

function overviewInput(overrides: Partial<OverviewArchitectureInput> = {}): OverviewArchitectureInput {
  return { principal, architectureScope: scope, baselineId: manifest.baselineId, projectionManifestId: manifest.id, ...overrides };
}

function impactInput(overrides: Partial<ImpactArchitectureInput> = {}): ImpactArchitectureInput {
  return { principal, architectureScope: scope, baselineId: manifest.baselineId, projectionManifestId: manifest.id, focusAssertionId: "biz-1", direction: "downstream", ...overrides };
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

  it("authorizes overview before manifest or graph-analysis access", async () => {
    const unauthorized = { ...principal, grants: [] };
    const service = createThreeAProjectionQueryService(repository, store, keyring, undefined, graphRepository);
    await expect(service.overview(overviewInput({ principal: unauthorized }))).rejects.toMatchObject({ code: "SCOPE_ACCESS_DENIED" });
    expect(graphRepository.loadOverview).not.toHaveBeenCalled();
  });

  it("validates the published manifest before mapping a bounded overview", async () => {
    const localGraphRepository = { ...graphRepository, loadOverview: vi.fn().mockResolvedValue({ availability: "READY", analysis, nodes: [{ ...scope, id: "cluster:biz", kind: "cluster", label: "Business", layer: "BIZ", clusterId: "biz", memberCount: 2, degree: 3, criticality: 0.8, positionSeed: { x: 1, y: 2 } }], edges: [], partialReasons: [], nextAfterClusterId: "biz" }) } as unknown as GraphAnalysisRepository;
    const service = createThreeAProjectionQueryService(repository, store, keyring, undefined, localGraphRepository);
    const result = await service.overview(overviewInput({ layers: ["BIZ"], assetTypes: ["rule"] }));
    expect(result.nodes).toHaveLength(1);
    expect(result.continuation).toBeTruthy();
    expect(localGraphRepository.loadOverview).toHaveBeenCalledWith(scope, manifest, expect.objectContaining({ layers: ["BIZ"], assetTypes: ["rule"], budget: { maxNodes: 250, maxEdges: 500, maxPaths: 100, timeoutMs: 3_000, maxPayloadBytes: 1_048_576 } }));
    await expect(service.overview(overviewInput({ layers: ["BIZ"], assetTypes: ["api"], continuation: result.continuation }))).rejects.toMatchObject({ code: "CURSOR_INVALID" });
    await expect(service.overview(overviewInput({ projectionManifestId: "missing" }))).rejects.toMatchObject({ code: "PROJECTION_MANIFEST_REQUIRED" });
  });

  it("maps impact metrics to explainable direct scores and policy-bound continuations", async () => {
    const biz = node("biz-1", "BIZ", "orders.intent"); const sys = node("sys-1", "SYS", "orders.api");
    repository.getFact = vi.fn().mockResolvedValue(source(biz)); repository.getFactsByIds = vi.fn().mockResolvedValue([source(sys)]);
    const localGraphRepository = { ...graphRepository, loadImpact: vi.fn().mockResolvedValue({ availability: "READY", analysis, edges: [edge(biz, sys, "REALIZED_BY")], metrics: [{ ...scope, assertionId: sys.assertionId, semanticIdentity: sys.semanticIdentity, layer: "SYS", degree: 2, criticality: 0.9, bridge: true, positionSeed: { x: 0, y: 0 }, inboundImpactWeight: 12, outboundImpactWeight: 4, contentDigest: "metric" }], partialReasons: [], nextAfterAssertionId: sys.assertionId }) } as unknown as GraphAnalysisRepository;
    const service = createThreeAProjectionQueryService(repository, store, keyring, undefined, localGraphRepository);
    const result = await service.impact(impactInput());
    expect(result.policyVersion).toBe("impact-v1");
    expect(result.items).toEqual([expect.objectContaining({ assertionId: sys.assertionId, depth: 1, band: "DIRECT", score: 10.8, factors: { relationWeight: 12, confidence: 1, criticalityWeight: 0.9, depthDecay: 1 } })]);
    expect(result.cutPointAssertionIds).toEqual([sys.assertionId]);
    await expect(service.impact(impactInput({ policyVersion: "impact-v2", continuation: result.continuation }))).rejects.toMatchObject({ code: "CURSOR_INVALID" });
  });
});
