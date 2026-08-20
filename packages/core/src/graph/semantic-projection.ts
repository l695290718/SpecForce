import { contentDigest as digest } from "../federation/digest";
import type { ArchitectureLayer } from "../knowledge/types";
import {
  materializeAsset3AMappings,
  type Asset3AMappingCoverageSource,
  type Asset3AMappingProjection
} from "../architecture-map/asset-mapping";
import type {
  ArchitectureUnitMappingProjection,
  ArchitectureUnitMemberProjection,
  ArchitectureUnitProjection
} from "../architecture-map/types";
import type { SemanticProjectionIdentity } from "./semantic-identity";

export type SemanticVertex =
  | { family: "DesignAsset"; id: string; logicalId: string; assetType: string; assetId: string; mappingMode: "DIRECT" | "TRACE" | "EXEMPT" | "BLOCKED"; reason?: string; contentDigest: string }
  | { family: "KnowledgeAssertion"; id: string; assertionId: string; semanticIdentity: string; layer: ArchitectureLayer; factType: string; confidence: number; contentDigest: string }
  | { family: "ArchitectureUnit"; id: string; unitIdentity: string; layer: ArchitectureLayer; kind: string; canonicalName: string; localizedName?: string; contentDigest: string };

export type SemanticEdgeFamily = "ASSERTION_SUBJECT" | "CLASSIFIED_AS" | "REALIZED_BY" | "DEPLOYED_ON" | "ASSERTION_RELATION" | "ASSET_RELATION" | "ARCHITECTURE_RELATION";

export interface SemanticEdge {
  family: SemanticEdgeFamily;
  id: string;
  sourceId: string;
  targetId: string;
  code: string;
  confidence: number;
  projectionOrdinal: bigint;
  relationshipVersion?: string;
  contentDigest: string;
}

export interface SemanticAssetSource {
  applicationServiceId: string;
  scopePath: string;
  generationId: string;
  baselineId: string;
  projectionManifestId: string;
  assetType: string;
  assetId: string;
  logicalId: string;
  contentDigest: string;
}

export interface SemanticAssertionSource {
  applicationServiceId: string;
  scopePath: string;
  generationId: string;
  baselineId: string;
  projectionManifestId: string;
  assertionId: string;
  semanticIdentity: string;
  factType: string;
  layer: ArchitectureLayer;
  confidence: number;
  status: "ACCEPTED" | "DRAFT" | "CANDIDATE" | "REJECTED" | "CONFLICTED" | "SUPERSEDED";
  contentDigest: string;
}

export interface SemanticAssetRelationshipSource {
  relationshipIdentity: string;
  sourceAssetType: string;
  sourceAssetId: string;
  targetAssetType: string;
  targetAssetId: string;
  relationCode: string;
  confidence: number;
  relationshipVersion: string;
  projectionOrdinal: bigint;
  contentDigest: string;
}

export interface SemanticAssertionRelationshipSource {
  relationshipIdentity: string;
  sourceAssertionId: string;
  targetAssertionId: string;
  relationCode: string;
  confidence: number;
  relationshipVersion?: string;
  projectionOrdinal: bigint;
  contentDigest: string;
}

export interface SemanticArchitectureRelationshipSource {
  relationshipIdentity: string;
  sourceUnitIdentity: string;
  targetUnitIdentity: string;
  relationCode: string;
  confidence: number;
  relationshipVersion?: string;
  projectionOrdinal: bigint;
  contentDigest: string;
}

export interface SemanticProjectionInput {
  identity: SemanticProjectionIdentity;
  assets: readonly SemanticAssetSource[];
  assertions: readonly SemanticAssertionSource[];
  units: readonly ArchitectureUnitProjection[];
  members: readonly ArchitectureUnitMemberProjection[];
  mappings: readonly ArchitectureUnitMappingProjection[];
  coverage: readonly Asset3AMappingCoverageSource[];
  assetRelationships: readonly SemanticAssetRelationshipSource[];
  assertionRelationships: readonly SemanticAssertionRelationshipSource[];
  architectureRelationships: readonly SemanticArchitectureRelationshipSource[];
}

export interface SemanticProjectionBatch {
  identity: SemanticProjectionIdentity;
  vertices: readonly SemanticVertex[];
  edges: readonly SemanticEdge[];
  counts: Readonly<Record<string, number>>;
  bucketDigests: Readonly<Record<string, string>>;
  contentDigest: string;
  semanticProbes: Readonly<Record<string, string>>;
}

export function materializeSemanticProjection(input: SemanticProjectionInput): SemanticProjectionBatch {
  assertInputIdentity(input);
  const mappings = materializeMappings(input);
  const assertions = new Map(input.assertions.filter((row) => row.status === "ACCEPTED").map((row) => [row.assertionId, row]));
  const units = new Map(input.units.map((row) => [row.unitIdentity, row]));
  const assets = new Map(input.assets.map((row) => [`${row.assetType}:${row.assetId}`, row]));

  const vertices: SemanticVertex[] = [
    ...input.units.map((unit) => ({
      family: "ArchitectureUnit" as const,
      id: unitId(unit.unitIdentity),
      unitIdentity: unit.unitIdentity,
      layer: unit.layer,
      kind: unit.kind,
      canonicalName: unit.canonicalName,
      ...(unit.localizedName ? { localizedName: unit.localizedName } : {}),
      contentDigest: unit.contentDigest
    })),
    ...input.assertions.filter((row) => row.status === "ACCEPTED").map((assertion) => ({
      family: "KnowledgeAssertion" as const,
      id: assertionId(assertion.assertionId),
      assertionId: assertion.assertionId,
      semanticIdentity: assertion.semanticIdentity,
      layer: assertion.layer,
      factType: assertion.factType,
      confidence: assertion.confidence,
      contentDigest: assertion.contentDigest
    })),
    ...mappings.map((mapping) => {
      const asset = assets.get(`${mapping.assetType}:${mapping.assetId}`);
      if (!asset) throw new Error("SEMANTIC_ASSET_NOT_FOUND");
      return {
        family: "DesignAsset" as const,
        id: assetId(asset.assetType, asset.assetId),
        logicalId: asset.logicalId,
        assetType: asset.assetType,
        assetId: asset.assetId,
        mappingMode: mapping.mappingMode,
        ...(mapping.reasonCode ? { reason: mapping.reasonCode } : {}),
        contentDigest: asset.contentDigest
      };
    })
  ];

  const edges: SemanticEdge[] = [];
  const probes: Record<string, string> = {};
  for (const mapping of mappings) {
    if (mapping.mappingMode === "DIRECT") {
      const member = input.members.find((row) => row.assertionId === mapping.directMembershipRevisionId);
      if (!member) throw new Error("SEMANTIC_ASSERTION_MEMBER_NOT_FOUND");
      const assertion = assertions.get(member.assertionId);
      const unit = mapping.targetUnitIdentity ? units.get(mapping.targetUnitIdentity) : undefined;
      if (!assertion || !unit) throw new Error("SEMANTIC_DIRECT_TARGET_NOT_FOUND");
      edges.push(makeEdge("ASSERTION_SUBJECT", assertionId(assertion.assertionId), assetId(mapping.assetType, mapping.assetId), "SUBJECT_OF", 1n, mapping.contentDigest));
      edges.push(makeEdge(layerEdgeFamily(unit.layer), assertionId(assertion.assertionId), unitId(unit.unitIdentity), "CLASSIFIED_AS", 1n, mapping.contentDigest));
      probes[`${mapping.assetType}:${mapping.assetId}:3a:${unit.layer}`] = unit.unitIdentity;
    } else if (mapping.mappingMode === "TRACE") {
      for (const [index, step] of mapping.pathEvidence.entries()) {
        edges.push(makeEdge("ASSET_RELATION", semanticNodeId(step.sourceSemanticIdentity), semanticNodeId(step.targetSemanticIdentity), step.relationCode, BigInt(index + 1), step.relationshipIdentity));
      }
      probes[`${mapping.assetType}:${mapping.assetId}:mapping`] = "TRACE";
    } else {
      probes[`${mapping.assetType}:${mapping.assetId}:mapping`] = mapping.mappingMode;
    }
  }

  for (const relationship of input.assetRelationships) {
    edges.push(makeEdge("ASSET_RELATION", assetId(relationship.sourceAssetType, relationship.sourceAssetId), assetId(relationship.targetAssetType, relationship.targetAssetId), relationship.relationCode, relationship.projectionOrdinal, relationship.contentDigest, relationship.relationshipVersion));
  }
  for (const relationship of input.assertionRelationships) {
    edges.push(makeEdge("ASSERTION_RELATION", assertionId(relationship.sourceAssertionId), assertionId(relationship.targetAssertionId), relationship.relationCode, relationship.projectionOrdinal, relationship.contentDigest, relationship.relationshipVersion));
  }
  for (const relationship of input.architectureRelationships) {
    edges.push(makeEdge("ARCHITECTURE_RELATION", unitId(relationship.sourceUnitIdentity), unitId(relationship.targetUnitIdentity), relationship.relationCode, relationship.projectionOrdinal, relationship.contentDigest, relationship.relationshipVersion));
  }
  for (const mapping of input.mappings) {
    edges.push(makeEdge("ARCHITECTURE_RELATION", unitId(mapping.sourceUnitIdentity), unitId(mapping.targetUnitIdentity), mapping.mappingFamily, 1n, mapping.contentDigest));
  }

  const sortedVertices = vertices.sort((left, right) => left.family.localeCompare(right.family, "en") || left.id.localeCompare(right.id, "en"));
  const sortedEdges = deduplicateEdges(edges).sort(compareEdges);
  const counts = {
    vertices: sortedVertices.length,
    edges: sortedEdges.length,
    ...countFamilies(sortedVertices, sortedEdges)
  };
  const bucketDigests = {
    ...digestBuckets(sortedVertices, (row) => row.family),
    ...digestBuckets(sortedEdges, (row) => row.family)
  };
  return {
    identity: input.identity,
    vertices: sortedVertices,
    edges: sortedEdges,
    counts,
    bucketDigests,
    contentDigest: digest({ identity: input.identity, vertices: sortedVertices, edges: sortedEdges }),
    semanticProbes: probes
  };
}

function materializeMappings(input: SemanticProjectionInput): Asset3AMappingProjection[] {
  const mappings = materializeAsset3AMappings({
    applicationServiceId: input.identity.applicationServiceId,
    scopePath: input.identity.scopePath,
    generationId: input.identity.generationId,
    coverageGenerationId: input.identity.coverageGenerationId,
    baselineId: input.identity.baselineId,
    projectionManifestId: input.identity.manifestId,
    coverage: input.coverage,
    members: input.members,
    units: input.units
  });
  if (mappings.some((row) => row.reasonCode === "MULTIPLE_DIRECT_TARGETS")) throw new Error("SEMANTIC_AMBIGUOUS_DIRECT_MAPPING");
  return mappings;
}

function assertInputIdentity(input: SemanticProjectionInput): void {
  for (const row of [...input.assets, ...input.assertions, ...input.units, ...input.members, ...input.mappings]) {
    if (row.applicationServiceId !== input.identity.applicationServiceId || row.scopePath !== input.identity.scopePath) throw new Error("SEMANTIC_SCOPE_MISMATCH");
    if ("generationId" in row && row.generationId !== input.identity.generationId) throw new Error("SEMANTIC_GENERATION_MISMATCH");
    if ("baselineId" in row && row.baselineId !== input.identity.baselineId) throw new Error("SEMANTIC_BASELINE_MISMATCH");
    if ("projectionManifestId" in row && row.projectionManifestId !== input.identity.manifestId) throw new Error("SEMANTIC_MANIFEST_MISMATCH");
  }
  for (const row of input.coverage) {
    if (row.applicationServiceId !== input.identity.applicationServiceId || row.scopePath !== input.identity.scopePath) throw new Error("SEMANTIC_SCOPE_MISMATCH");
    if (row.baselineId !== input.identity.baselineId || row.generationId !== input.identity.coverageGenerationId) throw new Error("SEMANTIC_COVERAGE_MISMATCH");
  }
}

function layerEdgeFamily(layer: ArchitectureLayer): "CLASSIFIED_AS" | "REALIZED_BY" | "DEPLOYED_ON" {
  if (layer === "BIZ") return "CLASSIFIED_AS";
  if (layer === "SYS") return "REALIZED_BY";
  return "DEPLOYED_ON";
}

function makeEdge(family: SemanticEdgeFamily, sourceId: string, targetId: string, code: string, projectionOrdinal: bigint, sourceDigest: string, relationshipVersion?: string): SemanticEdge {
  const value = { family, sourceId, targetId, code, projectionOrdinal, sourceDigest, relationshipVersion };
  return { family, id: `edge:${digest(value)}`, sourceId, targetId, code, confidence: 1, projectionOrdinal, ...(relationshipVersion ? { relationshipVersion } : {}), contentDigest: digest(value) };
}

function deduplicateEdges(edges: SemanticEdge[]): SemanticEdge[] {
  return [...new Map(edges.map((edge) => [`${edge.family}:${edge.sourceId}:${edge.targetId}:${edge.code}:${edge.projectionOrdinal}`, edge])).values()];
}

function compareEdges(left: SemanticEdge, right: SemanticEdge): number {
  return left.family.localeCompare(right.family, "en") || left.sourceId.localeCompare(right.sourceId, "en") || left.targetId.localeCompare(right.targetId, "en") || left.code.localeCompare(right.code, "en") || Number(left.projectionOrdinal - right.projectionOrdinal);
}

function countFamilies(vertices: readonly SemanticVertex[], edges: readonly SemanticEdge[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of vertices) result[`vertex:${row.family}`] = (result[`vertex:${row.family}`] ?? 0) + 1;
  for (const row of edges) result[`edge:${row.family}`] = (result[`edge:${row.family}`] ?? 0) + 1;
  return result;
}

function digestBuckets<T>(rows: readonly T[], key: (row: T) => string): Record<string, string> {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = key(row);
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), row]);
  }
  return Object.fromEntries([...buckets.entries()].sort(([left], [right]) => left.localeCompare(right, "en")).map(([key, bucket]) => [key, digest(bucket)]));
}

function assetId(assetType: string, assetIdValue: string): string { return `asset:${assetType}:${assetIdValue}`; }
function assertionId(assertionIdValue: string): string { return assertionIdValue.startsWith("assertion:") ? assertionIdValue : `assertion:${assertionIdValue}`; }
function unitId(unitIdentity: string): string { return unitIdentity; }
function semanticNodeId(identity: string): string { return identity.startsWith("unit:") || identity.startsWith("assertion:") ? identity : `asset:${identity}`; }
