import { describe, expect, it } from "vitest";
import { ProjectionMaterializer, materializeBatch, type ProjectionArchitectureUnitBatch } from "./materializer.js";
import type { ArchitectureUnitMaterializationInput } from "./architecture-unit-materializer.js";
import type { ArchitectureUnitProjectionRepository, GraphAnalysisPublication, GraphAnalysisPublicationRepository, ProjectionBuildRepository, ProjectionSourceBatch } from "./repository.js";
import type { ProjectionBuildJob } from "@specforge/core";

const scope = { applicationServiceId: "com.example.orders", scopePath: "org/orders/service" };
const job: ProjectionBuildJob = { ...scope, id: "job-1", buildKey: "key-1", generationId: "generation-1", baselineId: "baseline-1", profileId: "generic-system", profileVersion: "1", projectionSchemaVersion: "3a.v2", status: "BUILDING", attempt: 1, checkpoint: {}, nodeCount: 0, edgeCount: 0 };
const batch: ProjectionSourceBatch = { sourceRevisionIds: ["a-1", "a-2"], relationshipVersion: "r1", query: {}, checkpoint: { relationshipVersion: "r1" }, complete: true, assertions: [
  { id: "a-1", semanticIdentity: "orders.api", layer: "SYS", sortKey: "SYS|orders.api|a-1", contentDigest: "digest-a-1" },
  { id: "a-2", semanticIdentity: "orders.model", layer: "TECH", sortKey: "TECH|orders.model|a-2", contentDigest: "digest-a-2" }
], relationships: [{ relationshipIdentity: "orders.api-writes-model", source: { semanticIdentity: "orders.api" }, target: { semanticIdentity: "orders.model" }, relationCode: "WRITES", confidence: 0.9, relationshipVersion: "r1" }] };

const architectureIdentity = {
  applicationServiceId: job.applicationServiceId,
  scopePath: job.scopePath,
  generationId: job.generationId,
  baselineId: job.baselineId,
  projectionManifestId: `projection-manifest:${job.generationId}`
};

function architectureUnitInput(overrides: Partial<ArchitectureUnitMaterializationInput> = {}): ArchitectureUnitMaterializationInput {
  const biz = {
    ...architectureIdentity,
    unitIdentity: "unit:biz:policy-evaluation",
    layer: "BIZ" as const,
    kind: "CAPABILITY" as const,
    canonicalName: "Policy Evaluation",
    localizedName: "策略评估",
    aliases: ["policy"],
    memberCount: 1,
    criticality: 0.8,
    completeness: 1,
    evidenceCount: 1,
    unclassifiedMemberCount: 0,
    contentDigest: "unit-biz-digest",
    sourceType: "architecture-unit" as const
  };
  const sys = {
    ...architectureIdentity,
    unitIdentity: "unit:sys:policy-service",
    layer: "SYS" as const,
    kind: "SERVICE" as const,
    canonicalName: "Policy Service",
    localizedName: "策略服务",
    aliases: [],
    memberCount: 0,
    criticality: 0.7,
    completeness: 1,
    evidenceCount: 1,
    unclassifiedMemberCount: 0,
    contentDigest: "unit-sys-digest",
    sourceType: "architecture-unit" as const
  };
  return {
    ...architectureIdentity,
    units: [biz, sys],
    members: [{ ...architectureIdentity, unitIdentity: biz.unitIdentity, assertionId: "a-1", assetType: "businessRule", semanticIdentity: "orders.policy", contentDigest: "member-digest", sourceType: "architecture-unit-member" as const }],
    mappings: [{ ...architectureIdentity, mappingIdentity: "mapping:policy-realizes-service", sourceUnitIdentity: biz.unitIdentity, targetUnitIdentity: sys.unitIdentity, sourceLayer: "BIZ" as const, targetLayer: "SYS" as const, mappingFamily: "REALIZES", relationshipCount: 1, evidenceCount: 1, confidence: 0.9, contentDigest: "mapping-digest", sourceType: "architecture-unit-mapping" as const, sourceEndpoints: { source: biz, target: sys } }],
    ...overrides
  };
}

function architectureUnitInputWithIdentity(overrides: Partial<Pick<ArchitectureUnitMaterializationInput, "applicationServiceId" | "scopePath" | "generationId" | "baselineId" | "projectionManifestId">>): ArchitectureUnitMaterializationInput {
  const base = architectureUnitInput();
  const identity = { ...architectureIdentity, ...overrides };
  return {
    ...base,
    ...identity,
    units: base.units.map((unit) => ({ ...unit, ...identity })),
    members: [],
    mappings: []
  };
}

function lifecycleRepository(withArchitectureUnits: boolean) {
  const events: string[] = [];
  const architectureWrites: unknown[] = [];
  const published: unknown[] = [];
  const failed: string[] = [];
  const repository: ProjectionBuildRepository & Partial<ArchitectureUnitProjectionRepository> = {
    claim: async () => job,
    loadBatch: async () => batch,
    writeBatch: async () => { events.push("write"); return true; },
    publish: async () => { events.push("publish"); const manifest = { ...scope, id: "manifest-1", baselineId: job.baselineId, generationId: job.generationId, profileId: job.profileId, profileVersion: job.profileVersion, projectionSchemaVersion: "3a.v2" as const, sourceRevisionIds: [], relationshipVersion: "r1", query: {}, inputDigest: "input", contentDigest: "content", nodeCount: 2, edgeCount: 1, publishedAt: "2026-08-10T00:00:00.000Z" }; published.push(manifest); return manifest; },
    fail: async (_job, _owner, code) => { events.push("fail"); failed.push(code); return true; },
    health: async () => ({ status: "ok", code: "OK", queued: 0, building: 0, failed: 0, oldestQueuedAgeSeconds: null, lastPublishedAt: null })
  };
  if (withArchitectureUnits) repository.writeArchitectureUnitBatch = async (_job, _owner, materialization) => { events.push("architecture"); architectureWrites.push(materialization); return true; };
  return { repository, events, architectureWrites, published, failed };
}

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

  it.each([
    ["empty", undefined, 0, 0, 0],
    ["explicit", architectureUnitInput(), 2, 1, 1]
  ])("writes %s architecture-unit facts for a complete batch before publish", async (_name, input, unitCount, memberCount, mappingCount) => {
    const { repository, events, architectureWrites, published } = lifecycleRepository(true);
    const result = await new ProjectionMaterializer(repository, { owner: "test-owner", architectureUnitSource: async () => input }).process(job);

    expect(result.status).toBe("READY");
    expect(events).toEqual(["write", "architecture", "publish"]);
    expect(published).toHaveLength(1);
    expect(architectureWrites).toHaveLength(1);
    expect(architectureWrites[0]).toMatchObject({ units: { length: unitCount }, members: { length: memberCount }, mappings: { length: mappingCount }, generationId: job.generationId, baselineId: job.baselineId });
  });

  it.each([
    ["scope", { applicationServiceId: "com.other.service" }, "ARCHITECTURE_UNIT_SCOPE_MISMATCH"],
    ["generation", { generationId: "generation-2" }, "ARCHITECTURE_UNIT_PROJECTION_IDENTITY_MISMATCH"],
    ["baseline", { baselineId: "baseline-2" }, "ARCHITECTURE_UNIT_PROJECTION_IDENTITY_MISMATCH"],
    ["manifest", { projectionManifestId: "projection-manifest:generation-2" }, "ARCHITECTURE_UNIT_PROJECTION_MANIFEST_MISMATCH"]
  ])("fails before publish for architecture-unit %s mismatch", async (_name, mismatch, errorCode) => {
    const { repository, events, architectureWrites, published, failed } = lifecycleRepository(true);
    const result = await new ProjectionMaterializer(repository, { owner: "test-owner", architectureUnitSource: async () => architectureUnitInputWithIdentity(mismatch) }).process(job);

    expect(result).toEqual({ status: "FAILED", errorCode });
    expect(events).toEqual(["fail"]);
    expect(architectureWrites).toHaveLength(0);
    expect(published).toHaveLength(0);
    expect(failed).toEqual([errorCode]);
  });

  it("generates an empty derived result when no architectureUnitSource is configured", async () => {
    const { repository, architectureWrites } = lifecycleRepository(true);
    const result = await new ProjectionMaterializer(repository, { owner: "test-owner" }).process(job);

    expect(result.status).toBe("READY");
    expect(architectureWrites).toHaveLength(1);
    expect(architectureWrites[0]).toMatchObject({ units: [], members: [], mappings: [], architectureScope: scope });
  });

  it("keeps legacy repositories compatible when writeArchitectureUnitBatch is unavailable", async () => {
    let sourceCalls = 0;
    const { repository, events, published } = lifecycleRepository(false);
    const result = await new ProjectionMaterializer(repository, { owner: "test-owner", architectureUnitSource: async () => { sourceCalls += 1; return architectureUnitInput(); } }).process(job);

    expect(result.status).toBe("READY");
    expect(sourceCalls).toBe(0);
    expect(events).toEqual(["write", "publish"]);
    expect(published).toHaveLength(1);
  });
});
