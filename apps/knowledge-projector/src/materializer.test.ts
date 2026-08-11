import { describe, expect, it } from "vitest";
import { ProjectionBuildError, ProjectionMaterializer, materializeBatch } from "./materializer.js";
import type { GraphAnalysisPublication, GraphAnalysisPublicationRepository, ProjectionBuildRepository, ProjectionSourceBatch } from "./repository.js";
import type { ProjectionBuildJob } from "@specforge/core";

const scope = { applicationServiceId: "com.example.orders", scopePath: "org/orders/service" };
const job: ProjectionBuildJob = { ...scope, id: "job-1", buildKey: "key-1", generationId: "generation-1", baselineId: "baseline-1", profileId: "generic-system", profileVersion: "1", projectionSchemaVersion: "3a.v2", status: "BUILDING", attempt: 1, checkpoint: {}, nodeCount: 0, edgeCount: 0 };
const batch: ProjectionSourceBatch = { sourceRevisionIds: ["a-1", "a-2"], relationshipVersion: "r1", query: {}, checkpoint: { relationshipVersion: "r1" }, complete: true, assertions: [
  { id: "a-1", semanticIdentity: "orders.api", layer: "SYS", sortKey: "SYS|orders.api|a-1", contentDigest: "digest-a-1" },
  { id: "a-2", semanticIdentity: "orders.model", layer: "TECH", sortKey: "TECH|orders.model|a-2", contentDigest: "digest-a-2" }
], relationships: [{ relationshipIdentity: "orders.api-writes-model", source: { semanticIdentity: "orders.api" }, target: { semanticIdentity: "orders.model" }, relationCode: "WRITES", confidence: 0.9, relationshipVersion: "r1" }] };

describe("3A projection materializer", () => {
  it("materializes nodes and typed edges without using current relationship state", () => {
    const result = materializeBatch(job, batch);
    expect(result.nodes.map((node) => node.assertionId)).toEqual(["a-1", "a-2"]);
    expect(result.edges).toMatchObject([{ sourceAssertionId: "a-1", targetAssertionId: "a-2", relationCode: "WRITES" }]);
  });

  it("fails closed for ambiguous endpoints", () => {
    expect(() => materializeBatch(job, { ...batch, relationships: [{ ...batch.relationships[0]!, relationshipIdentity: "ambiguous", source: { semanticIdentity: "orders.api" } }], assertions: [...batch.assertions, { ...batch.assertions[0]!, id: "a-3", contentDigest: "digest-a-3" }] })).toThrow("PROJECTION_ENDPOINT_AMBIGUOUS");
  });

  it("resumes after a persisted checkpoint", async () => {
    const calls: string[] = [];
    const repository: ProjectionBuildRepository = { claim: async () => job, loadBatch: async () => ({ ...batch, complete: true, assertions: [batch.assertions[1]!], relationships: [] }), writeBatch: async (_job, _owner, value) => { calls.push(value.nodes[0]!.assertionId); return true; }, publish: async () => ({ ...scope, id: "manifest-1", baselineId: "baseline-1", generationId: "generation-1", profileId: "generic-system", profileVersion: "1", projectionSchemaVersion: "3a.v2", sourceRevisionIds: [], relationshipVersion: "r1", query: {}, inputDigest: "input", contentDigest: "content", nodeCount: 1, edgeCount: 0, publishedAt: "2026-08-10T00:00:00.000Z" }), fail: async () => true, health: async () => ({ status: "ok", code: "OK", queued: 0, building: 0, failed: 0, oldestQueuedAgeSeconds: null, lastPublishedAt: null }) };
    const result = await new ProjectionMaterializer(repository, { owner: "test-owner" }).process({ ...job, checkpoint: { assertionSortKey: "SYS|orders.api|a-1" } });
    expect(result).toMatchObject({ status: "READY", resumed: true });
    expect(calls).toEqual(["a-2"]);
  });

  it("publishes default derived analysis after the authoritative projection manifest", async () => {
    const published: GraphAnalysisPublication[] = [];
    const manifest = { ...scope, id: "manifest-1", baselineId: job.baselineId, generationId: job.generationId, profileId: job.profileId, profileVersion: job.profileVersion, projectionSchemaVersion: "3a.v2" as const, sourceRevisionIds: [], relationshipVersion: "r1", query: {}, inputDigest: "input", contentDigest: "content", nodeCount: 2, edgeCount: 1, publishedAt: "2026-08-10T00:00:00.000Z" };
    const repository: ProjectionBuildRepository & GraphAnalysisPublicationRepository = {
      claim: async () => job,
      loadBatch: async () => batch,
      writeBatch: async () => true,
      publish: async () => manifest,
      fail: async () => true,
      health: async () => ({ status: "ok", code: "OK", queued: 0, building: 0, failed: 0, oldestQueuedAgeSeconds: null, lastPublishedAt: null }),
      loadPublishedProjection: async () => ({ nodes: materializeBatch(job, batch).nodes, edges: materializeBatch(job, batch).edges }),
      publishGraphAnalysis: async (_job, _manifest, publication) => { published.push(publication); return { status: "PUBLISHED", analysisId: "analysis-1", idempotent: false }; },
      markGraphAnalysisUnavailable: async () => ({ status: "UNAVAILABLE", idempotent: false, code: "unexpected" })
    };

    const result = await new ProjectionMaterializer(repository, { owner: "test-owner" }).process(job);

    expect(result).toMatchObject({ status: "READY", manifestId: manifest.id, derivedAnalysis: "PUBLISHED" });
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ scope, generationId: job.generationId, projectionManifestId: manifest.id });
  });
});
