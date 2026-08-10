import type { AssetType } from "../types";
import type { ArchitectureScopeRef } from "../architecture/types";
import { contentDigest } from "../federation/digest";
import type { ArchitectureLayer, Baseline } from "./types";

export const THREE_A_PROJECTION_SCHEMA_VERSION = "3a.v2" as const;

export type ProjectionBuildStatus = "QUEUED" | "BUILDING" | "READY" | "FAILED";

export interface ProjectionBuildJob extends ArchitectureScopeRef {
  id: string;
  buildKey: string;
  generationId: string;
  baselineId: string;
  profileId: string;
  profileVersion: string;
  projectionSchemaVersion: typeof THREE_A_PROJECTION_SCHEMA_VERSION;
  status: ProjectionBuildStatus;
  attempt: number;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  checkpoint: { assertionSortKey?: string; relationshipVersion?: string };
  nodeCount: number;
  edgeCount: number;
  errorCode?: string;
  diagnosticRef?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
}

export interface ProjectionManifestV2 extends ArchitectureScopeRef {
  id: string;
  baselineId: string;
  generationId: string;
  profileId: string;
  profileVersion: string;
  projectionSchemaVersion: typeof THREE_A_PROJECTION_SCHEMA_VERSION;
  sourceRevisionIds: string[];
  relationshipVersion: string;
  query: Record<string, unknown>;
  inputDigest: string;
  contentDigest: string;
  nodeCount: number;
  edgeCount: number;
  publishedAt: string;
}

export interface KnowledgeProjectionNode extends ArchitectureScopeRef {
  generationId: string;
  baselineId: string;
  assertionId: string;
  semanticIdentity: string;
  layer: ArchitectureLayer;
  sortKey: string;
  acceptedAssetType?: AssetType;
  acceptedAssetId?: string;
  contentDigest: string;
}

export interface KnowledgeProjectionEdge extends ArchitectureScopeRef {
  generationId: string;
  baselineId: string;
  relationshipIdentity: string;
  relationshipAssertionId?: string;
  relationshipEventId?: string;
  sourceAssertionId: string;
  targetAssertionId: string;
  sourceSemanticIdentity: string;
  targetSemanticIdentity: string;
  relationCode: string;
  confidence: number;
  relationshipVersion: string;
  contentDigest: string;
}

export type PublishedBaselineDriftChange = "ADDED" | "REMOVED" | "CHANGED" | "UNCHANGED";
export type PublishedBaselineDriftEntity = "NODE" | "EDGE";

export interface PublishedBaselineDriftItem {
  entityKind: PublishedBaselineDriftEntity;
  stableKey: string;
  change: PublishedBaselineDriftChange;
  baseContentDigest?: string;
  targetContentDigest?: string;
  baseAssertionId?: string;
  targetAssertionId?: string;
  baseRelationshipIdentity?: string;
  targetRelationshipIdentity?: string;
}

export interface PublishedBaselineDrift extends ArchitectureScopeRef {
  baseBaselineId: string;
  targetBaselineId: string;
  baseManifestId: string;
  targetManifestId: string;
  items: PublishedBaselineDriftItem[];
  digest: string;
}

export interface ProjectionBuildKeyInput {
  architectureScope: ArchitectureScopeRef;
  baselineId: string;
  profileId: string;
  profileVersion: string;
  projectionSchemaVersion: typeof THREE_A_PROJECTION_SCHEMA_VERSION;
  sourceRevisionIds: string[];
  relationshipVersion: string;
  query: Record<string, unknown>;
  attempt?: number;
  createdAt?: string;
}

export interface PublishedBaselineComparisonInput {
  baseBaseline: Pick<Baseline, "id" | "architectureScope" | "status" | "publishedAt">;
  targetBaseline: Pick<Baseline, "id" | "architectureScope" | "status" | "publishedAt">;
  baseManifest: ProjectionManifestV2;
  targetManifest: ProjectionManifestV2;
  baseNodes: readonly KnowledgeProjectionNode[];
  targetNodes: readonly KnowledgeProjectionNode[];
  baseEdges: readonly KnowledgeProjectionEdge[];
  targetEdges: readonly KnowledgeProjectionEdge[];
}

export function isOfficialBaseline(value: Pick<Baseline, "status" | "publishedAt">): boolean {
  return (value.status === "PUBLISHED" || value.status === "SUPERSEDED") && Boolean(value.publishedAt);
}

export function projectionBuildKey(input: ProjectionBuildKeyInput): string {
  return contentDigest({
    architectureScope: input.architectureScope,
    baselineId: input.baselineId,
    profileId: input.profileId,
    profileVersion: input.profileVersion,
    projectionSchemaVersion: input.projectionSchemaVersion,
    sourceRevisionIds: [...input.sourceRevisionIds].sort(),
    relationshipVersion: input.relationshipVersion,
    query: canonicalizeRecord(input.query)
  });
}

export function comparePublishedBaselines(input: PublishedBaselineComparisonInput): PublishedBaselineDrift {
  assertComparableOfficialBaselines(input);
  const nodeItems = compareByStableKey(input.baseNodes, input.targetNodes, (node) => node.semanticIdentity, "NODE");
  const edgeItems = compareByStableKey(
    input.baseEdges,
    input.targetEdges,
    (edge) => [edge.sourceSemanticIdentity, edge.relationCode, edge.targetSemanticIdentity, edge.relationshipIdentity].join("|"),
    "EDGE"
  );
  const items = [...nodeItems, ...edgeItems].sort((left, right) => left.stableKey.localeCompare(right.stableKey));
  const scope = input.baseBaseline.architectureScope;
  return {
    ...scope,
    baseBaselineId: input.baseBaseline.id,
    targetBaselineId: input.targetBaseline.id,
    baseManifestId: input.baseManifest.id,
    targetManifestId: input.targetManifest.id,
    items,
    digest: contentDigest({ scope, baseBaselineId: input.baseBaseline.id, targetBaselineId: input.targetBaseline.id, baseManifestId: input.baseManifest.id, targetManifestId: input.targetManifest.id, items })
  };
}

function assertComparableOfficialBaselines(input: PublishedBaselineComparisonInput): void {
  if (!isOfficialBaseline(input.baseBaseline) || !isOfficialBaseline(input.targetBaseline)) throw new Error("BASELINE_NOT_OFFICIAL");
  assertExactScope(input.baseBaseline.architectureScope, input.targetBaseline.architectureScope);
  assertExactScope(input.baseBaseline.architectureScope, input.baseManifest);
  assertExactScope(input.targetBaseline.architectureScope, input.targetManifest);
  if (input.baseManifest.baselineId !== input.baseBaseline.id || input.targetManifest.baselineId !== input.targetBaseline.id) throw new Error("PROJECTION_MANIFEST_BASELINE_MISMATCH");
  if (input.baseManifest.projectionSchemaVersion !== THREE_A_PROJECTION_SCHEMA_VERSION || input.targetManifest.projectionSchemaVersion !== THREE_A_PROJECTION_SCHEMA_VERSION) throw new Error("PROJECTION_MANIFEST_VERSION_UNSUPPORTED");
}

function assertExactScope(left: ArchitectureScopeRef, right: ArchitectureScopeRef): void {
  if (left.applicationServiceId !== right.applicationServiceId || left.scopePath !== right.scopePath) throw new Error("SCOPE_MISMATCH");
}

function compareByStableKey<T extends { contentDigest: string; assertionId?: string; relationshipIdentity?: string }>(
  base: readonly T[],
  target: readonly T[],
  keyOf: (value: T) => string,
  entityKind: PublishedBaselineDriftEntity
): PublishedBaselineDriftItem[] {
  const baseMap = new Map(base.map((value) => [keyOf(value), value]));
  const targetMap = new Map(target.map((value) => [keyOf(value), value]));
  const keys = [...new Set([...baseMap.keys(), ...targetMap.keys()])].sort();
  return keys.map((stableKey) => {
    const baseValue = baseMap.get(stableKey);
    const targetValue = targetMap.get(stableKey);
    const item: PublishedBaselineDriftItem = {
      entityKind,
      stableKey,
      change: !baseValue ? "ADDED" : !targetValue ? "REMOVED" : baseValue.contentDigest === targetValue.contentDigest ? "UNCHANGED" : "CHANGED",
      ...(baseValue ? { baseContentDigest: baseValue.contentDigest } : {}),
      ...(targetValue ? { targetContentDigest: targetValue.contentDigest } : {}),
      ...(baseValue?.assertionId ? { baseAssertionId: baseValue.assertionId } : {}),
      ...(targetValue?.assertionId ? { targetAssertionId: targetValue.assertionId } : {}),
      ...(baseValue?.relationshipIdentity ? { baseRelationshipIdentity: baseValue.relationshipIdentity } : {}),
      ...(targetValue?.relationshipIdentity ? { targetRelationshipIdentity: targetValue.relationshipIdentity } : {})
    };
    return item;
  });
}

function canonicalizeRecord(value: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(value)) return value.map((item) => canonicalizeUnknown(item)) as unknown as Record<string, unknown>;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalizeUnknown(item)]));
}

function canonicalizeUnknown(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeUnknown);
  if (value && typeof value === "object") return canonicalizeRecord(value as Record<string, unknown>);
  return value;
}
