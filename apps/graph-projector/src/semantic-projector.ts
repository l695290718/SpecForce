import type { SemanticGenerationScope, SemanticPage, SemanticSourceBinding } from "./semantic-source-repository.js";

export interface SemanticProjectionIdentity {
  applicationServiceId: string;
  scopePath: string;
  manifestId: string;
  generationId: string;
  baselineId: string;
  profileId: string;
  profileVersion: string;
  projectionSchemaVersion: string;
  semanticSchemaVersion: "nebula.3a.semantic.v1";
  sourceProjectionManifestId: string;
  sourceCoverageManifestId: string;
  knowledgeGenerationId: string;
  coverageGenerationId: string;
  relationshipVersion: string;
  catalogVersion: string;
  catalogDigest: string;
}

export interface SemanticBatchVertex {
  family: "DesignAsset" | "KnowledgeAssertion" | "ArchitectureUnit";
  id: string;
  logicalId?: string;
  assetType?: string;
  assetId?: string;
  assertionId?: string;
  semanticIdentity?: string;
  factType?: string;
  unitIdentity?: string;
  layer?: "BIZ" | "SYS" | "TECH";
  kind?: string;
  canonicalName?: string;
  localizedName?: string;
  mappingMode?: "DIRECT" | "TRACE" | "EXEMPT" | "BLOCKED";
  reason?: string;
  confidence?: number;
  contentDigest: string;
}

export interface SemanticBatchEdge {
  family: string;
  id: string;
  sourceId: string;
  targetId: string;
  code: string;
  confidence: number;
  projectionOrdinal: bigint;
  relationshipVersion?: string;
  contentDigest: string;
}

export interface SemanticBatch {
  identity: SemanticProjectionIdentity;
  vertices: readonly SemanticBatchVertex[];
  edges: readonly SemanticBatchEdge[];
  counts: Readonly<Record<string, number>>;
  bucketDigests: Readonly<Record<string, string>>;
  contentDigest: string;
  semanticProbes: Readonly<Record<string, string>>;
}

export interface SemanticSourceReader {
  readSourceBinding(scope: SemanticGenerationScope): Promise<SemanticSourceBinding>;
  readAssets(scope: SemanticGenerationScope, cursor: string | null, limit: number): Promise<SemanticPage<unknown>>;
  readAssertions(scope: SemanticGenerationScope, cursor: string | null, limit: number): Promise<SemanticPage<unknown>>;
  readUnits(scope: SemanticGenerationScope, cursor: string | null, limit: number): Promise<SemanticPage<unknown>>;
  readMembers(scope: SemanticGenerationScope, cursor: string | null, limit: number): Promise<SemanticPage<unknown>>;
  readUnitMappings(scope: SemanticGenerationScope, cursor: string | null, limit: number): Promise<SemanticPage<unknown>>;
  readAssetCoverage(scope: SemanticGenerationScope, cursor: string | null, limit: number): Promise<SemanticPage<unknown>>;
  readAssetRelationships(scope: SemanticGenerationScope, cursor: string | null, limit: number): Promise<SemanticPage<unknown>>;
  readAssertionRelationships(scope: SemanticGenerationScope, cursor: string | null, limit: number): Promise<SemanticPage<unknown>>;
  readArchitectureRelationships(scope: SemanticGenerationScope, cursor: string | null, limit: number): Promise<SemanticPage<unknown>>;
}

export interface SemanticBatchMaterializer {
  createIdentity(scope: SemanticGenerationScope, binding: SemanticSourceBinding): SemanticProjectionIdentity;
  materialize(input: Record<string, unknown>): SemanticBatch;
}

export interface SemanticGatewayRequest {
  scope: { enterpriseId: string; applicationServiceId: string; scopePath: string };
  projection: { baselineId: string; manifestId: string; generationId: string; schemaVersion: string };
  manifestStatus: "BUILDING";
  source: SemanticSourceBinding;
  vertices: readonly Record<string, unknown>[];
  edges: readonly Record<string, unknown>[];
}

export interface SemanticGateway {
  project(request: SemanticGatewayRequest): Promise<{ projection: SemanticGatewayRequest["projection"]; projectedVertexCount: number; projectedEdgeCount: number }>;
}

export interface SemanticGenerationLifecycle {
  markValidated(scope: SemanticGenerationScope, manifestId: string): Promise<unknown>;
  publish(scope: SemanticGenerationScope, manifestId: string): Promise<unknown>;
  recordCheckpoint?(scope: SemanticGenerationScope, manifestId: string, partitionId: string, projectionVersion: bigint, status: "COMPLETED" | "FAILED", error?: string): Promise<void>;
}

export interface SemanticGenerationBuildReceipt {
  manifestId: string;
  identity: SemanticProjectionIdentity;
  partitionsCompleted: number;
  vertexCount: number;
  edgeCount: number;
  counts: Readonly<Record<string, number>>;
  bucketDigests: Readonly<Record<string, string>>;
  contentDigest: string;
  semanticProbes: Readonly<Record<string, string>>;
}

export interface SemanticGenerationBuildOptions {
  pageSize?: number;
  maxRows?: number;
  verify?: (batch: SemanticBatch, receipt: Awaited<ReturnType<SemanticGateway["project"]>>) => Promise<boolean> | boolean;
}

export interface SemanticGenerationDependencies {
  source: SemanticSourceReader;
  materializer: SemanticBatchMaterializer;
  gateway: SemanticGateway;
  lifecycle: SemanticGenerationLifecycle;
  options?: SemanticGenerationBuildOptions;
}

export async function buildSemanticGeneration(scope: SemanticGenerationScope, dependencies: SemanticGenerationDependencies): Promise<SemanticGenerationBuildReceipt> {
  const pageSize = dependencies.options?.pageSize ?? 500;
  const maxRows = dependencies.options?.maxRows ?? 50_000;
  if (!Number.isInteger(pageSize) || pageSize <= 0 || pageSize > 10_000) throw new Error("SEMANTIC_PAGE_LIMIT_INVALID");
  if (!Number.isInteger(maxRows) || maxRows < pageSize) throw new Error("SEMANTIC_BATCH_LIMIT_INVALID");
  const source = await dependencies.source.readSourceBinding(scope);
  const identity = dependencies.materializer.createIdentity(scope, source);
  const [assets, assertions, units, members, mappings, coverage, assetRelationships, assertionRelationships, architectureRelationships] = await Promise.all([
    readAll(dependencies.source.readAssets.bind(dependencies.source), scope, pageSize, maxRows),
    readAll(dependencies.source.readAssertions.bind(dependencies.source), scope, pageSize, maxRows),
    readAll(dependencies.source.readUnits.bind(dependencies.source), scope, pageSize, maxRows),
    readAll(dependencies.source.readMembers.bind(dependencies.source), scope, pageSize, maxRows),
    readAll(dependencies.source.readUnitMappings.bind(dependencies.source), scope, pageSize, maxRows),
    readAll(dependencies.source.readAssetCoverage.bind(dependencies.source), scope, pageSize, maxRows),
    readAll(dependencies.source.readAssetRelationships.bind(dependencies.source), scope, pageSize, maxRows),
    readAll(dependencies.source.readAssertionRelationships.bind(dependencies.source), scope, pageSize, maxRows),
    readAll(dependencies.source.readArchitectureRelationships.bind(dependencies.source), scope, pageSize, maxRows),
  ]);
  const input = { identity, assets, assertions, units, members, mappings, coverage, assetRelationships, assertionRelationships, architectureRelationships };
  const batch = dependencies.materializer.materialize(input);
  if (batch.vertices.length + batch.edges.length > maxRows) throw new Error("SEMANTIC_BATCH_LIMIT_EXCEEDED");
  const request: SemanticGatewayRequest = {
    scope: { enterpriseId: scope.enterpriseId, applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath },
    projection: { baselineId: identity.baselineId, manifestId: identity.manifestId, generationId: identity.generationId, schemaVersion: identity.projectionSchemaVersion },
    manifestStatus: "BUILDING",
    source,
    vertices: batch.vertices.map((vertex) => ({ ...vertex, scope: { enterpriseId: scope.enterpriseId, applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath } })),
    edges: batch.edges.map((edge) => ({ ...edge, scope: { enterpriseId: scope.enterpriseId, applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath }, projectionOrdinal: edge.projectionOrdinal.toString() })),
  };
  let receipt: Awaited<ReturnType<SemanticGateway["project"]>>;
  try {
    receipt = await dependencies.gateway.project(request);
  } catch (error) {
    await dependencies.lifecycle.recordCheckpoint?.(scope, scope.manifestId, "semantic-core", 0n, "FAILED", error instanceof Error ? error.message : "SEMANTIC_GATEWAY_DELIVERY_FAILED");
    throw error;
  }
  try {
    if (receipt.projection.manifestId !== identity.manifestId || receipt.projection.generationId !== identity.generationId || receipt.projectedVertexCount !== batch.vertices.length || receipt.projectedEdgeCount !== batch.edges.length) throw new Error("SEMANTIC_GATEWAY_RECEIPT_INVALID");
    if (dependencies.options?.verify && !(await dependencies.options.verify(batch, receipt))) throw new Error("SEMANTIC_PARITY_MISMATCH");
  } catch (error) {
    await dependencies.lifecycle.recordCheckpoint?.(scope, scope.manifestId, "semantic-core", 0n, "FAILED", error instanceof Error ? error.message : "SEMANTIC_PARITY_MISMATCH");
    throw error;
  }
  await dependencies.lifecycle.recordCheckpoint?.(scope, scope.manifestId, "semantic-core", BigInt(batch.vertices.length + batch.edges.length), "COMPLETED");
  await dependencies.lifecycle.markValidated(scope, scope.manifestId);
  await dependencies.lifecycle.publish(scope, scope.manifestId);
  return { manifestId: scope.manifestId, identity, partitionsCompleted: 1, vertexCount: batch.vertices.length, edgeCount: batch.edges.length, counts: batch.counts, bucketDigests: batch.bucketDigests, contentDigest: batch.contentDigest, semanticProbes: batch.semanticProbes };
}

async function readAll(reader: (scope: SemanticGenerationScope, cursor: string | null, limit: number) => Promise<SemanticPage<unknown>>, scope: SemanticGenerationScope, pageSize: number, maxRows: number): Promise<unknown[]> {
  const rows: unknown[] = [];
  let cursor: string | null = null;
  do {
    const page = await reader(scope, cursor, pageSize);
    rows.push(...page.items);
    if (rows.length > maxRows) throw new Error("SEMANTIC_SOURCE_LIMIT_EXCEEDED");
    cursor = page.nextCursor;
  } while (cursor !== null);
  return rows;
}
