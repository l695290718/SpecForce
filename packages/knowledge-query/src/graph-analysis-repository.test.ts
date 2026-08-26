import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createGraphAnalysisRepository, defaultGraphAnalysisVersion, graphAnalysisWriteBatchSize } from "./graph-analysis-repository";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const manifest = { ...scope, id: "manifest-1", baselineId: "baseline-1", generationId: "generation-1", profileId: "generic-system", profileVersion: "1", projectionSchemaVersion: "3a.v2" as const, sourceRevisionIds: ["a-1"], relationshipVersion: "relationship-1", query: {}, inputDigest: "input", contentDigest: "projection-content", nodeCount: 3, edgeCount: 2, publishedAt: "2026-08-11T00:00:00.000Z" };
const budget = { maxNodes: 25, maxEdges: 50, maxPaths: 10, timeoutMs: 1_000, maxPayloadBytes: 100_000 };

function analysisRow(overrides: Record<string, unknown> = {}) {
  return { dbId: "11111111-1111-1111-1111-111111111111", ...scope, generationId: manifest.generationId, baselineId: manifest.baselineId, projectionManifestId: manifest.id, analysisVersion: defaultGraphAnalysisVersion, policyVersion: "impact-v1", status: "READY", sourceContentDigest: manifest.contentDigest, relationshipVersion: manifest.relationshipVersion, contentDigest: "analysis-digest", summaryEdges: [{ ...scope, id: "edge-1", sourceId: "cluster:biz", targetId: "cluster:sys", relationCode: "DEPENDS_ON", confidence: 0.9, bridge: true }], partialReasons: [], clusterCount: 2, nodeMetricCount: 3, bridgeEdgeCount: 1, publishedAt: new Date("2026-08-11T00:00:00.000Z"), ...overrides };
}

function clusterRow(clusterId = "biz", overrides: Record<string, unknown> = {}) {
  return { ...scope, analysisId: "11111111-1111-1111-1111-111111111111", clusterId, label: clusterId.toUpperCase(), layer: "BIZ", memberCount: 2, degree: 3, criticality: 0.8, positionX: 10, positionY: 20, contentDigest: `cluster-${clusterId}`, ...overrides };
}

function metricRow(assertionId = "fact-1", overrides: Record<string, unknown> = {}) {
  return { ...scope, analysisId: "11111111-1111-1111-1111-111111111111", assertionId, semanticIdentity: assertionId, layer: "SYS", acceptedAssetType: "api", clusterId: "sys", degree: 2, criticality: 0.9, isBridge: true, positionX: 1, positionY: 2, inboundImpactWeight: 1.2, outboundImpactWeight: 0.7, contentDigest: `metric-${assertionId}`, ...overrides };
}

function fakePrisma(overrides: Record<string, unknown> = {}) {
  return {
    knowledgeGraphAnalysis: { findFirst: vi.fn().mockResolvedValue(analysisRow()), findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue(analysisRow()) },
    knowledgeGraphCluster: { findMany: vi.fn().mockResolvedValue([clusterRow("biz"), clusterRow("sys", { layer: "SYS" })]), upsert: vi.fn() },
    knowledgeGraphNodeMetric: { findMany: vi.fn().mockResolvedValue([metricRow()]), upsert: vi.fn() },
    knowledgeProjectionEdge: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides
  } as unknown as PrismaClient;
}

describe("GraphAnalysisRepository", () => {
  it("binds overview reads to the exact Scope, generation, manifest, version, and bounded Prisma take", async () => {
    const prisma = fakePrisma();
    const repository = createGraphAnalysisRepository(prisma);

    await repository.loadOverview(scope, manifest, { layers: ["BIZ"], budget });

    expect(prisma.knowledgeGraphAnalysis.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { ...scope, generationId: manifest.generationId, baselineId: manifest.baselineId, projectionManifestId: manifest.id, analysisVersion: defaultGraphAnalysisVersion, status: "PUBLISHED" }, take: 1 }));
    expect(prisma.knowledgeGraphCluster.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ...scope, analysisId: analysisRow().dbId, layer: { in: ["BIZ"] } }, orderBy: [{ clusterId: "asc" }], take: budget.maxNodes + 1 }));
    expect(prisma.knowledgeProjectionEdge.findMany).not.toHaveBeenCalled();
  });

  it("treats the analysis bound to this manifest as READY even when the materializer and publication digest formulas differ (ADR-0042)", async () => {
    // sourceContentDigest (materializer shape) and manifest.contentDigest (publication shape) are
    // computed by different formulas; the composite key already binds this row to this manifest.
    const prisma = fakePrisma({ knowledgeGraphAnalysis: { findFirst: vi.fn().mockResolvedValue(analysisRow({ sourceContentDigest: "materializer-shape-digest", relationshipVersion: manifest.relationshipVersion })) } });
    const repository = createGraphAnalysisRepository(prisma);

    const result = await repository.loadOverview(scope, manifest, { budget });

    expect(result).toMatchObject({ availability: "READY", analysis: expect.objectContaining({ id: analysisRow().dbId }) });
    expect(prisma.knowledgeGraphCluster.findMany).toHaveBeenCalled();
  });

  it("keeps EMPTY and VERSION_MISMATCH as explicit non-ready degradations", async () => {
    const empty = createGraphAnalysisRepository(fakePrisma({ knowledgeGraphAnalysis: { findFirst: vi.fn().mockResolvedValue(analysisRow({ nodeMetricCount: 0 })) } }));
    expect((await empty.loadOverview(scope, manifest, { budget })).availability).toBe("EMPTY");
    const mismatched = createGraphAnalysisRepository(fakePrisma({ knowledgeGraphAnalysis: { findFirst: vi.fn().mockResolvedValue(analysisRow({ analysisVersion: "other.v1" })) } }));
    expect((await mismatched.loadOverview(scope, manifest, { budget })).availability).toBe("VERSION_MISMATCH");
  });

  it("fails closed when a returned row escapes the requested Scope", async () => {
    const prisma = fakePrisma({ knowledgeGraphAnalysis: { findFirst: vi.fn().mockResolvedValue(analysisRow({ scopePath: "sibling" })) } });
    const repository = createGraphAnalysisRepository(prisma);

    await expect(repository.loadOverview(scope, manifest, { budget })).rejects.toThrow("PROJECTION_SCOPE_MISMATCH");
  });

  it("keeps cluster membership paged and never reads an unbounded metric set", async () => {
    const prisma = fakePrisma({ knowledgeGraphNodeMetric: { findMany: vi.fn().mockResolvedValue([metricRow("a"), metricRow("b")]) } });
    const repository = createGraphAnalysisRepository(prisma);

    const result = await repository.loadClusterMembers(scope, manifest, { clusterId: "sys", afterSemanticIdentity: "a", limit: 1 });

    expect(result.members).toHaveLength(1);
    expect(result.nextAfterSemanticIdentity).toBe("a");
    expect(prisma.knowledgeGraphNodeMetric.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ...scope, analysisId: analysisRow().dbId, clusterId: "sys", semanticIdentity: { gt: "a" } }, orderBy: [{ semanticIdentity: "asc" }, { assertionId: "asc" }], take: 2 }));
  });

  it("uses indexed directional adjacency and bounded metric lookup for impact", async () => {
    const edge = { ...scope, generationId: manifest.generationId, baselineId: manifest.baselineId, relationshipIdentity: "edge-1", sourceAssertionId: "focus", targetAssertionId: "fact-1", sourceSemanticIdentity: "focus", targetSemanticIdentity: "fact-1", relationCode: "DEPENDS_ON", confidence: 0.8, relationshipVersion: manifest.relationshipVersion, contentDigest: "edge-digest" };
    const prisma = fakePrisma({ knowledgeProjectionEdge: { findMany: vi.fn().mockResolvedValue([edge]) } });
    const repository = createGraphAnalysisRepository(prisma);

    const result = await repository.loadImpact(scope, manifest, { focusAssertionId: "focus", direction: "downstream", relationTypes: ["DEPENDS_ON"], budget });

    expect(result.metrics).toHaveLength(1);
    expect(prisma.knowledgeProjectionEdge.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ...scope, generationId: manifest.generationId, baselineId: manifest.baselineId, sourceAssertionId: "focus", relationCode: { in: ["DEPENDS_ON"] } }, take: budget.maxEdges + 1 }));
    expect(prisma.knowledgeGraphNodeMetric.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ...scope, analysisId: analysisRow().dbId, assertionId: { in: ["fact-1"] } }, take: budget.maxNodes + 1 }));
  });

  it("makes same-version same-digest publication idempotent and blocks a version collision", async () => {
    const upsert = vi.fn().mockResolvedValue(analysisRow());
    const prisma = fakePrisma({ knowledgeGraphAnalysis: { findUnique: vi.fn().mockResolvedValue(null), upsert } });
    const repository = createGraphAnalysisRepository(prisma);
    const input = { analysisVersion: defaultGraphAnalysisVersion, policyVersion: "impact-v1", contentDigest: "analysis-digest", summaryEdges: analysisRow().summaryEdges, clusterCount: 2, nodeMetricCount: 3, bridgeEdgeCount: 1 };

    await repository.upsertAnalysis(scope, manifest, input);

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { applicationServiceId_scopePath_generationId_projectionManifestId_analysisVersion: { ...scope, generationId: manifest.generationId, projectionManifestId: manifest.id, analysisVersion: defaultGraphAnalysisVersion } } }));
    const conflicting = fakePrisma({ knowledgeGraphAnalysis: { findUnique: vi.fn().mockResolvedValue(analysisRow({ contentDigest: "other" })), upsert: vi.fn() } });
    await expect(createGraphAnalysisRepository(conflicting).upsertAnalysis(scope, manifest, input)).rejects.toThrow("GRAPH_ANALYSIS_VERSION_CONFLICT");
  });

  it("rejects write batches above the fixed bounded batch size", async () => {
    const repository = createGraphAnalysisRepository(fakePrisma());
    const metrics = Array.from({ length: graphAnalysisWriteBatchSize + 1 }, (_, index) => ({ assertionId: `a-${index}`, semanticIdentity: `a-${index}`, layer: "SYS" as const, degree: 0, criticality: 0, bridge: false, positionSeed: { x: 0, y: 0 }, inboundImpactWeight: 1, outboundImpactWeight: 1, contentDigest: `d-${index}` }));

    await expect(repository.upsertNodeMetrics(scope, { ...scope, id: analysisRow().dbId, generationId: manifest.generationId, baselineId: manifest.baselineId, projectionManifestId: manifest.id, analysisVersion: defaultGraphAnalysisVersion, policyVersion: "impact-v1", sourceContentDigest: manifest.contentDigest, relationshipVersion: manifest.relationshipVersion, contentDigest: "analysis-digest" }, metrics)).rejects.toThrow("GRAPH_ANALYSIS_METRIC_BATCH_LIMIT");
  });
});
