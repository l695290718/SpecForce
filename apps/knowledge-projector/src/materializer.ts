import { contentDigest, projectionBuildKey, type KnowledgeProjectionEdge, type KnowledgeProjectionNode, type ProjectionBuildJob } from "@specforge/core";
import { materializeArchitectureUnits, type ArchitectureUnitMaterialization, type ArchitectureUnitMaterializationInput } from "./architecture-unit-materializer.js";
import type { ArchitectureUnitProjectionRepository, GraphAnalysisPublicationRepository, MaterializedProjectionBatch, ProjectionBuildRepository, ProjectionEndpoint, ProjectionSourceAssertion, ProjectionSourceBatch, ProjectionSourceRelationship, ProjectionPublication } from "./repository.js";
import { DEFAULT_GRAPH_ANALYSIS_VERSION, DeterministicGraphAnalysisMaterializer, type GraphAnalysisMaterializer } from "./graph-analysis-materializer.js";

export const DEFAULT_PROJECTION_BATCH_SIZE = 500;
export const PROJECTION_LEASE_MS = 30_000;

export interface ProjectionProcessResult {
  status: "IDLE" | "BATCHED" | "READY" | "FAILED";
  resumed?: boolean;
  manifestId?: string;
  errorCode?: string;
  derivedAnalysis?: "PUBLISHED" | "UNAVAILABLE";
}

export class ProjectionBuildError extends Error {
  constructor(readonly code: string) { super(code); }
}

export interface ProjectionEndpointResolutionInput {
  relationship: ProjectionSourceRelationship;
  assertionsBySemanticIdentity: Map<string, ProjectionSourceAssertion[]>;
  assertionsByPromotedAsset: Map<string, ProjectionSourceAssertion[]>;
}

export interface ProjectionArchitectureUnitBatch extends ProjectionSourceBatch {
  architectureUnitFacts?: ArchitectureUnitMaterializationInput;
}

export type ArchitectureUnitSourceLoader = (job: ProjectionBuildJob, batch: ProjectionSourceBatch) => Promise<ArchitectureUnitMaterializationInput | undefined>;

export class ProjectionMaterializer {
  constructor(private readonly repository: ProjectionBuildRepository, private readonly options: { owner?: string; now?: () => Date; batchSize?: number; leaseDurationMs?: number; analysisVersion?: string; graphAnalysisMaterializer?: GraphAnalysisMaterializer; architectureUnitSource?: ArchitectureUnitSourceLoader } = {}) {}

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
      if (!await this.renewLease(job, owner)) throw new ProjectionBuildError("PROJECTION_BUILD_LEASE_LOST");
      const batch = await this.repository.loadBatch(job, this.options.batchSize ?? DEFAULT_PROJECTION_BATCH_SIZE);
      const materialized = materializeBatch(job, batch);
      const architectureRepository = isArchitectureUnitProjectionRepository(this.repository) ? this.repository : undefined;
      const architectureUnits = batch.complete && architectureRepository
        ? await this.materializeArchitectureUnits(job, batch)
        : undefined;
      if (!await this.renewLease(job, owner)) throw new ProjectionBuildError("PROJECTION_BUILD_LEASE_LOST");
      if (!await this.repository.writeBatch(job, owner, materialized)) {
        console.error(`[knowledge-projector] batch write rejected id=${job.id} owner=${owner}`);
        throw new ProjectionBuildError("PROJECTION_BUILD_LEASE_LOST");
      }
      if (!batch.complete) return { status: "BATCHED", resumed: Boolean(job.checkpoint.assertionSortKey) };
      if (architectureUnits) {
        if (!await this.renewLease(job, owner)) throw new ProjectionBuildError("PROJECTION_BUILD_LEASE_LOST");
        if (!architectureRepository) throw new ProjectionBuildError("ARCHITECTURE_UNIT_REPOSITORY_UNAVAILABLE");
        if (!await architectureRepository.writeArchitectureUnitBatch(job, owner, architectureUnits)) {
          console.error(`[knowledge-projector] architecture unit write rejected id=${job.id} owner=${owner}`);
          throw new ProjectionBuildError("PROJECTION_BUILD_LEASE_LOST");
        }
      }
      if (!await this.renewLease(job, owner)) throw new ProjectionBuildError("PROJECTION_BUILD_LEASE_LOST");
      const publication = publicationFrom(job, batch, materialized);
      const manifest = await this.repository.publish(job, owner, publication);
      const derivedAnalysis = await this.publishDerivedAnalysis(job, manifest);
      return { status: "READY", manifestId: manifest.id, resumed: Boolean(job.checkpoint.assertionSortKey), derivedAnalysis };
    } catch (error) {
      const code = error instanceof ProjectionBuildError ? error.code : error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message) ? error.message : "PROJECTION_BUILD_FAILED";
      await this.repository.fail(job, owner, code, `projection-build:${job.id}:${code}`);
      return { status: "FAILED", errorCode: code };
    }
  }

  private owner(): string { return this.options.owner ?? `knowledge-projector:${process.pid}`; }
  private now(): Date { return this.options.now?.() ?? new Date(); }
  private async renewLease(job: ProjectionBuildJob, owner: string): Promise<boolean> {
    const renewLease = this.repository.renewLease;
    if (!renewLease) return true;
    const leaseExpiresAt = new Date(this.now().getTime() + (this.options.leaseDurationMs ?? PROJECTION_LEASE_MS));
    const renewed = await renewLease.call(this.repository, job, owner, leaseExpiresAt);
    if (!renewed) console.error(`[knowledge-projector] lease renewal rejected id=${job.id} owner=${owner}`);
    return renewed;
  }

  private async materializeArchitectureUnits(job: ProjectionBuildJob, batch: ProjectionSourceBatch): Promise<ArchitectureUnitMaterialization> {
    const input = this.options.architectureUnitSource
      ? await this.options.architectureUnitSource(job, batch)
      : (batch as ProjectionArchitectureUnitBatch).architectureUnitFacts;
    const materialization = materializeArchitectureUnits(input ?? emptyArchitectureUnitInput(job));
    assertArchitectureUnitMaterializationMatchesJob(job, materialization);
    return materialization;
  }

  private async publishDerivedAnalysis(job: ProjectionBuildJob, manifest: import("@specforge/core").ProjectionManifestV2): Promise<"PUBLISHED" | "UNAVAILABLE"> {
    if (!isGraphAnalysisPublicationRepository(this.repository)) return "UNAVAILABLE";
    const analysisVersion = this.options.analysisVersion ?? DEFAULT_GRAPH_ANALYSIS_VERSION;
    try {
      const snapshot = await this.repository.loadPublishedProjection(job, manifest);
      const publication = await (this.options.graphAnalysisMaterializer ?? new DeterministicGraphAnalysisMaterializer()).build({
        scope: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath },
        generationId: job.generationId,
        baselineId: job.baselineId,
        projectionManifestId: manifest.id,
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        analysisVersion
      });
      const result = await this.repository.publishGraphAnalysis(job, manifest, publication);
      return result.status;
    } catch (error) {
      const code = graphAnalysisErrorCode(error);
      try {
        await this.repository.markGraphAnalysisUnavailable(job, manifest, analysisVersion, code);
      } catch {
        // Projection publication remains authoritative even when a derived-status write is unavailable.
      }
      return "UNAVAILABLE";
    }
  }
}

function isGraphAnalysisPublicationRepository(repository: ProjectionBuildRepository): repository is ProjectionBuildRepository & GraphAnalysisPublicationRepository {
  const candidate = repository as Partial<GraphAnalysisPublicationRepository>;
  return typeof candidate.loadPublishedProjection === "function"
    && typeof candidate.publishGraphAnalysis === "function"
    && typeof candidate.markGraphAnalysisUnavailable === "function";
}

function isArchitectureUnitProjectionRepository(repository: ProjectionBuildRepository): repository is ProjectionBuildRepository & ArchitectureUnitProjectionRepository {
  return typeof (repository as Partial<ArchitectureUnitProjectionRepository>).writeArchitectureUnitBatch === "function";
}

function emptyArchitectureUnitInput(job: ProjectionBuildJob): ArchitectureUnitMaterializationInput {
  return {
    applicationServiceId: job.applicationServiceId,
    scopePath: job.scopePath,
    generationId: job.generationId,
    baselineId: job.baselineId,
    projectionManifestId: `projection-manifest:${job.generationId}`,
    units: [],
    members: [],
    mappings: []
  };
}

function assertArchitectureUnitMaterializationMatchesJob(job: ProjectionBuildJob, materialization: ArchitectureUnitMaterialization): void {
  if (materialization.architectureScope.applicationServiceId !== job.applicationServiceId || materialization.architectureScope.scopePath !== job.scopePath) {
    throw new ProjectionBuildError("ARCHITECTURE_UNIT_SCOPE_MISMATCH");
  }
  if (materialization.generationId !== job.generationId || materialization.baselineId !== job.baselineId) {
    throw new ProjectionBuildError("ARCHITECTURE_UNIT_PROJECTION_IDENTITY_MISMATCH");
  }
  if (materialization.projectionManifestId !== `projection-manifest:${job.generationId}`) {
    throw new ProjectionBuildError("ARCHITECTURE_UNIT_PROJECTION_MANIFEST_MISMATCH");
  }
}

function graphAnalysisErrorCode(error: unknown): string {
  return error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message) ? error.message : "DERIVED_ANALYSIS_UNAVAILABLE";
}

export function materializeBatch(job: ProjectionBuildJob, batch: ProjectionSourceBatch): MaterializedProjectionBatch {
  const nodes = batch.assertions.map((assertion) => nodeFromAssertion(job, assertion));
  const assertionsBySemanticIdentity = new Map<string, ProjectionSourceAssertion[]>();
  const assertionsByPromotedAsset = new Map<string, ProjectionSourceAssertion[]>();
  for (const assertion of [...batch.assertions, ...(batch.relationshipAssertions ?? [])]) {
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
  if (current.some((item) => item.id === value.id)) return;
  current.push(value);
  map.set(key, current);
}
