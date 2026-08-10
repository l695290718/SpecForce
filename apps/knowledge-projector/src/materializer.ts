import { contentDigest, projectionBuildKey, type KnowledgeProjectionEdge, type KnowledgeProjectionNode, type ProjectionBuildJob } from "@specforge/core";
import type { MaterializedProjectionBatch, ProjectionBuildRepository, ProjectionEndpoint, ProjectionSourceAssertion, ProjectionSourceBatch, ProjectionSourceRelationship, ProjectionPublication } from "./repository.js";

export const DEFAULT_PROJECTION_BATCH_SIZE = 500;
export const PROJECTION_LEASE_MS = 30_000;

export interface ProjectionProcessResult {
  status: "IDLE" | "BATCHED" | "READY" | "FAILED";
  resumed?: boolean;
  manifestId?: string;
  errorCode?: string;
}

export class ProjectionBuildError extends Error {
  constructor(readonly code: string) { super(code); }
}

export interface ProjectionEndpointResolutionInput {
  relationship: ProjectionSourceRelationship;
  assertionsBySemanticIdentity: Map<string, ProjectionSourceAssertion[]>;
  assertionsByPromotedAsset: Map<string, ProjectionSourceAssertion[]>;
}

export class ProjectionMaterializer {
  constructor(private readonly repository: ProjectionBuildRepository, private readonly options: { owner?: string; now?: () => Date; batchSize?: number; leaseDurationMs?: number } = {}) {}

  async processOnce(): Promise<ProjectionProcessResult> {
    const now = this.now();
    const owner = this.owner();
    const job = await this.repository.claim(owner, now, new Date(now.getTime() + (this.options.leaseDurationMs ?? PROJECTION_LEASE_MS)));
    if (!job) return { status: "IDLE" };
    return this.process(job);
  }

  async process(job: ProjectionBuildJob): Promise<ProjectionProcessResult> {
    const owner = this.owner();
    try {
      const batch = await this.repository.loadBatch(job, this.options.batchSize ?? DEFAULT_PROJECTION_BATCH_SIZE);
      const materialized = materializeBatch(job, batch);
      if (!await this.repository.writeBatch(job, owner, materialized)) throw new ProjectionBuildError("PROJECTION_BUILD_LEASE_LOST");
      if (!batch.complete) return { status: "BATCHED", resumed: Boolean(job.checkpoint.assertionSortKey) };
      const publication = publicationFrom(job, batch, materialized);
      const manifest = await this.repository.publish(job, owner, publication);
      return { status: "READY", manifestId: manifest.id, resumed: Boolean(job.checkpoint.assertionSortKey) };
    } catch (error) {
      const code = error instanceof ProjectionBuildError ? error.code : error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message) ? error.message : "PROJECTION_BUILD_FAILED";
      await this.repository.fail(job, owner, code, `projection-build:${job.id}:${code}`);
      return { status: "FAILED", errorCode: code };
    }
  }

  private owner(): string { return this.options.owner ?? `knowledge-projector:${process.pid}`; }
  private now(): Date { return this.options.now?.() ?? new Date(); }
}

export function materializeBatch(job: ProjectionBuildJob, batch: ProjectionSourceBatch): MaterializedProjectionBatch {
  const nodes = batch.assertions.map((assertion) => nodeFromAssertion(job, assertion));
  const assertionsBySemanticIdentity = new Map<string, ProjectionSourceAssertion[]>();
  const assertionsByPromotedAsset = new Map<string, ProjectionSourceAssertion[]>();
  for (const assertion of batch.assertions) {
    add(assertionsBySemanticIdentity, assertion.semanticIdentity, assertion);
    if (assertion.acceptedAssetType && assertion.acceptedAssetId) add(assertionsByPromotedAsset, `${assertion.acceptedAssetType}:${assertion.acceptedAssetId}`, assertion);
  }
  const edges = batch.relationships.map((relationship) => resolveProjectionEdge({ relationship, assertionsBySemanticIdentity, assertionsByPromotedAsset })).map((edge) => edgeFromSource(job, edge));
  return { nodes, edges, checkpoint: batch.checkpoint };
}

export function resolveProjectionEdge(input: ProjectionEndpointResolutionInput): { relationship: ProjectionSourceRelationship; source: ProjectionSourceAssertion; target: ProjectionSourceAssertion } {
  const source = resolveUniqueAssertion(input.relationship.source, input.assertionsBySemanticIdentity, input.assertionsByPromotedAsset);
  const target = resolveUniqueAssertion(input.relationship.target, input.assertionsBySemanticIdentity, input.assertionsByPromotedAsset);
  if (source.length === 0 || target.length === 0) throw new ProjectionBuildError("PROJECTION_ENDPOINT_UNRESOLVED");
  if (source.length !== 1 || target.length !== 1) throw new ProjectionBuildError("PROJECTION_ENDPOINT_AMBIGUOUS");
  return { relationship: input.relationship, source: source[0]!, target: target[0]! };
}

function resolveUniqueAssertion(endpoint: ProjectionEndpoint, bySemantic: Map<string, ProjectionSourceAssertion[]>, byAsset: Map<string, ProjectionSourceAssertion[]>): ProjectionSourceAssertion[] {
  const matches = endpoint.semanticIdentity ? bySemantic.get(endpoint.semanticIdentity) ?? [] : endpoint.assetType && endpoint.assetId ? byAsset.get(`${endpoint.assetType}:${endpoint.assetId}`) ?? [] : [];
  if (endpoint.assertionId) return matches.filter((item) => item.id === endpoint.assertionId);
  return matches;
}

function nodeFromAssertion(job: ProjectionBuildJob, assertion: ProjectionSourceAssertion): KnowledgeProjectionNode {
  return { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, generationId: job.generationId, baselineId: job.baselineId, assertionId: assertion.id, semanticIdentity: assertion.semanticIdentity, layer: assertion.layer, sortKey: assertion.sortKey, ...(assertion.acceptedAssetType ? { acceptedAssetType: assertion.acceptedAssetType as KnowledgeProjectionNode["acceptedAssetType"] } : {}), ...(assertion.acceptedAssetId ? { acceptedAssetId: assertion.acceptedAssetId } : {}), contentDigest: assertion.contentDigest };
}

function edgeFromSource(job: ProjectionBuildJob, resolved: { relationship: ProjectionSourceRelationship; source: ProjectionSourceAssertion; target: ProjectionSourceAssertion }): KnowledgeProjectionEdge {
  const { relationship, source, target } = resolved;
  return { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, generationId: job.generationId, baselineId: job.baselineId, relationshipIdentity: relationship.relationshipIdentity, ...(relationship.relationshipAssertionId ? { relationshipAssertionId: relationship.relationshipAssertionId } : {}), ...(relationship.relationshipEventId ? { relationshipEventId: relationship.relationshipEventId } : {}), sourceAssertionId: source.id, targetAssertionId: target.id, sourceSemanticIdentity: source.semanticIdentity, targetSemanticIdentity: target.semanticIdentity, relationCode: relationship.relationCode, confidence: relationship.confidence, relationshipVersion: relationship.relationshipVersion, contentDigest: contentDigest({ relationshipIdentity: relationship.relationshipIdentity, sourceAssertionId: source.id, targetAssertionId: target.id, relationCode: relationship.relationCode, confidence: relationship.confidence, relationshipVersion: relationship.relationshipVersion }) };
}

function publicationFrom(job: ProjectionBuildJob, batch: ProjectionSourceBatch, materialized: MaterializedProjectionBatch): ProjectionPublication {
  const sourceRevisionIds = [...batch.sourceRevisionIds].sort();
  const query = batch.query;
  const inputDigest = projectionBuildKey({ architectureScope: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath }, baselineId: job.baselineId, profileId: job.profileId, profileVersion: job.profileVersion, projectionSchemaVersion: "3a.v2", sourceRevisionIds, relationshipVersion: batch.relationshipVersion, query });
  return { sourceRevisionIds, relationshipVersion: batch.relationshipVersion, query, inputDigest, contentDigest: contentDigest({ generationId: job.generationId, nodes: materialized.nodes, edges: materialized.edges, inputDigest }), nodeCount: job.nodeCount + materialized.nodes.length, edgeCount: job.edgeCount + materialized.edges.length };
}

function add(map: Map<string, ProjectionSourceAssertion[]>, key: string, value: ProjectionSourceAssertion): void {
  const current = map.get(key) ?? [];
  current.push(value);
  map.set(key, current);
}
