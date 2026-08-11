import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { ProjectionBuildJob, ProjectionManifestV2 } from "@specforge/core";
import { PrismaProjectionBuildRepository, type GraphAnalysisPublication, validateGraphAnalysisPublication } from "./repository.js";

const scope = { applicationServiceId: "com.example.orders", scopePath: "org/orders/service" };
const job: ProjectionBuildJob = { ...scope, id: "job-1", buildKey: "key-1", generationId: "generation-1", baselineId: "baseline-1", profileId: "generic-system", profileVersion: "1", projectionSchemaVersion: "3a.v2", status: "BUILDING", attempt: 1, checkpoint: {}, nodeCount: 2, edgeCount: 1 };
const manifest: ProjectionManifestV2 = { ...scope, id: "projection-manifest:generation-1", baselineId: job.baselineId, generationId: job.generationId, profileId: job.profileId, profileVersion: job.profileVersion, projectionSchemaVersion: "3a.v2", sourceRevisionIds: [], relationshipVersion: "r1", query: {}, inputDigest: "input", contentDigest: "manifest-digest", nodeCount: 2, edgeCount: 1, publishedAt: "2026-08-10T00:00:00.000Z" };
const publication: GraphAnalysisPublication = {
  scope,
  generationId: job.generationId,
  baselineId: job.baselineId,
  projectionManifestId: manifest.id,
  analysisVersion: "3a.graph-analysis.v1",
  policyVersion: "impact-v1",
  relationshipVersion: manifest.relationshipVersion,
  sourceContentDigest: "projection-digest",
  contentDigest: "analysis-digest",
  clusters: [{ clusterId: "cluster-1", label: "SYS:orders", layer: "SYS", memberCount: 1, degree: 1, criticality: 70, positionX: 0, positionY: 0, contentDigest: "cluster-digest" }],
  nodeMetrics: [{ assertionId: "assertion-1", semanticIdentity: "orders.service", layer: "SYS", clusterId: "cluster-1", degree: 1, criticality: 70, isBridge: false, positionX: 0, positionY: 0, inboundImpactWeight: 1, outboundImpactWeight: 1.9, contentDigest: "metric-digest" }],
  summaryEdges: [],
  partialReasons: []
};

describe("graph analysis projection repository", () => {
  it("rejects a graph analysis publication outside the projection Scope", () => {
    expect(() => validateGraphAnalysisPublication(job, manifest, { ...publication, scope: { ...scope, scopePath: "other/scope" } })).toThrow("GRAPH_ANALYSIS_SCOPE_MISMATCH");
  });

  it("reads a published projection with the full, exact Scope identity", async () => {
    let nodeWhere: unknown;
    let edgeWhere: unknown;
    const prisma = {
      knowledgeProjectionNode: { findMany: async (args: { where: unknown }) => { nodeWhere = args.where; return [{ ...scope, generationId: job.generationId, baselineId: job.baselineId, assertionId: "assertion-1", semanticIdentity: "orders.service", layer: "SYS", sortKey: "SYS|orders.service|assertion-1", acceptedAssetType: null, acceptedAssetId: null, contentDigest: "node-digest" }]; } },
      knowledgeProjectionEdge: { findMany: async (args: { where: unknown }) => { edgeWhere = args.where; return []; } }
    } as unknown as PrismaClient;

    const snapshot = await new PrismaProjectionBuildRepository(prisma).loadPublishedProjection(job, manifest);

    expect(snapshot.nodes).toHaveLength(1);
    expect(nodeWhere).toEqual({ ...scope, generationId: job.generationId, baselineId: job.baselineId });
    expect(edgeWhere).toEqual({ ...scope, generationId: job.generationId, baselineId: job.baselineId });
  });

  it("treats an identical published analysis as idempotent without replacing derived rows", async () => {
    const calls: string[] = [];
    const graph = {
      knowledgeGraphAnalysis: {
        findUnique: async () => ({ dbId: "analysis-1", status: "PUBLISHED", contentDigest: publication.contentDigest }),
        upsert: async () => { calls.push("upsert"); return { dbId: "analysis-1" }; }
      },
      knowledgeGraphCluster: { deleteMany: async () => { calls.push("delete-clusters"); }, createMany: async () => { calls.push("create-clusters"); } },
      knowledgeGraphNodeMetric: { deleteMany: async () => { calls.push("delete-metrics"); }, createMany: async () => { calls.push("create-metrics"); } }
    };
    const prisma = { $transaction: async <T>(callback: (transaction: typeof graph) => Promise<T>) => callback(graph) } as unknown as PrismaClient;

    const result = await new PrismaProjectionBuildRepository(prisma).publishGraphAnalysis(job, manifest, publication);

    expect(result).toEqual({ status: "PUBLISHED", analysisId: "analysis-1", idempotent: true });
    expect(calls).toEqual([]);
  });

  it("records an unavailable derived analysis without changing the authoritative projection", async () => {
    const writes: unknown[] = [];
    const graph = {
      knowledgeGraphAnalysis: { findUnique: async () => null, upsert: async (args: unknown) => { writes.push(args); return { dbId: "analysis-1" }; } },
      knowledgeGraphCluster: { deleteMany: async () => undefined, createMany: async () => undefined },
      knowledgeGraphNodeMetric: { deleteMany: async () => undefined, createMany: async () => undefined }
    };
    const prisma = { $transaction: async <T>(callback: (transaction: typeof graph) => Promise<T>) => callback(graph) } as unknown as PrismaClient;

    const result = await new PrismaProjectionBuildRepository(prisma).markGraphAnalysisUnavailable(job, manifest, publication.analysisVersion, "DERIVED_ANALYSIS_UNAVAILABLE");

    expect(result).toMatchObject({ status: "UNAVAILABLE", analysisId: "analysis-1", code: "DERIVED_ANALYSIS_UNAVAILABLE" });
    expect(writes[0]).toMatchObject({ create: expect.objectContaining({ ...scope, status: "UNAVAILABLE", baselineId: job.baselineId, projectionManifestId: manifest.id }) });
  });
});
