import type { ArchitectureScopeRef } from "../architecture/types";
import { contentDigest } from "../federation/digest";
import { assertExactScope } from "./service";
import { genericSystemAnalysisProfile } from "./profiles";
import type { AnalysisProfile, ArchitectureLayer, Baseline, KnowledgeAssertion } from "./types";

export const KNOWLEDGE_PROJECTION_SCHEMA_VERSION = "3a.v1";

export interface KnowledgeProjectionRelationship {
  id: string;
  sourceAssertionId: string;
  targetAssertionId: string;
  code: string;
  confidence: number;
  architectureScope: ArchitectureScopeRef;
}

export interface ProjectedKnowledgeNode {
  id: string;
  semanticIdentity: string;
  factType: string;
  layer: ArchitectureLayer;
  aspect: KnowledgeAssertion["aspect"];
  status: KnowledgeAssertion["status"];
  confidence: number;
  domainCluster?: string;
  value: Record<string, unknown>;
  evidenceRefs: string[];
}

export interface ProjectedKnowledgeEdge {
  id: string;
  sourceAssertionId: string;
  targetAssertionId: string;
  code: string;
  confidence: number;
}

export interface KnowledgeLayerProjection {
  layer: ArchitectureLayer;
  baselineId: string;
  profileId: string;
  profileVersion: string;
  sourceRevisionIds: string[];
  nodes: ProjectedKnowledgeNode[];
  edges: ProjectedKnowledgeEdge[];
  digest: string;
}

export interface KnowledgeAlignmentItem {
  relationshipId: string;
  sourceLayer: ArchitectureLayer;
  targetLayer: ArchitectureLayer;
  sourceAssertionId: string;
  targetAssertionId: string;
  code: string;
  confidence: number;
}

export interface KnowledgeAlignmentProjection {
  baselineId: string;
  items: KnowledgeAlignmentItem[];
  unalignedAssertionIds: string[];
  digest: string;
}

export type KnowledgeDriftKind = "ADDED" | "REMOVED" | "CHANGED" | "UNCHANGED";

export interface KnowledgeDriftItem {
  semanticIdentity: string;
  baselineAssertionId?: string;
  currentAssertionId?: string;
  layer: ArchitectureLayer;
  kind: KnowledgeDriftKind;
  baselineDigest?: string;
  currentDigest?: string;
}

export interface KnowledgeDriftProjection {
  baselineId: string;
  items: KnowledgeDriftItem[];
  digest: string;
}

export interface PinnedKnowledgeContextPack {
  id: string;
  baselineId: string;
  profileId: string;
  profileVersion: string;
  architectureScope: ArchitectureScopeRef;
  sourceRevisionIds: string[];
  contentDigest: string;
  markdown: string;
}

export interface KnowledgeProjectionBundle {
  baselineId: string;
  architectureScope: ArchitectureScopeRef;
  profileId: string;
  profileVersion: string;
  layers: Record<ArchitectureLayer, KnowledgeLayerProjection>;
  alignment: KnowledgeAlignmentProjection;
  drift: KnowledgeDriftProjection;
  contextPack: PinnedKnowledgeContextPack;
  digest: string;
}

export interface DeriveKnowledgeProjectionInput {
  baseline: Pick<Baseline, "id" | "status" | "manifest" | "architectureScope">;
  assertions: readonly KnowledgeAssertion[];
  currentAssertions?: readonly KnowledgeAssertion[];
  relationships?: readonly KnowledgeProjectionRelationship[];
  profile?: AnalysisProfile;
}

export function deriveKnowledgeProjection(input: DeriveKnowledgeProjectionInput): KnowledgeProjectionBundle {
  const profile = input.profile ?? genericSystemAnalysisProfile;
  const scope = input.baseline.architectureScope;
  if (input.baseline.status !== "PUBLISHED") throw new Error("BASELINE_NOT_PUBLISHED");
  assertExactScope(input.baseline.manifest.architectureScope, scope);

  const sourceIds = [...new Set(input.baseline.manifest.sourceRevisionIds)].sort();
  const sourceIdSet = new Set(sourceIds);
  const baselineAssertions = input.assertions.filter((assertion) => {
    assertExactScope(assertion.architectureScope, scope);
    return assertion.status === "ACCEPTED" && (sourceIdSet.has(assertion.id) || assertion.changeSetId === input.baseline.manifest.changeSetId);
  });
  const hasChangeSetBinding = baselineAssertions.some((assertion) => assertion.changeSetId === input.baseline.manifest.changeSetId);
  if (baselineAssertions.length === 0 || (!hasChangeSetBinding && baselineAssertions.length !== sourceIds.length)) throw new Error("PROJECTION_SOURCE_MISSING");
  const projectionSourceIds = baselineAssertions.map((assertion) => assertion.id).sort();

  const assertionMap = new Map(baselineAssertions.map((assertion) => [assertion.id, assertion]));
  const scopedRelationships = (input.relationships ?? []).filter((relationship) => {
    assertExactScope(relationship.architectureScope, scope);
    return assertionMap.has(relationship.sourceAssertionId) && assertionMap.has(relationship.targetAssertionId);
  });
  const layers = {
    BIZ: buildLayerProjection("BIZ", input.baseline.id, scope, profile, projectionSourceIds, baselineAssertions, scopedRelationships),
    SYS: buildLayerProjection("SYS", input.baseline.id, scope, profile, projectionSourceIds, baselineAssertions, scopedRelationships),
    TECH: buildLayerProjection("TECH", input.baseline.id, scope, profile, projectionSourceIds, baselineAssertions, scopedRelationships)
  } satisfies Record<ArchitectureLayer, KnowledgeLayerProjection>;
  const alignment = buildAlignment(input.baseline.id, baselineAssertions, scopedRelationships);
  const drift = buildDrift(input.baseline.id, scope, baselineAssertions, input.currentAssertions ?? baselineAssertions);
  const contextPack = buildContextPack(input.baseline.id, scope, profile, projectionSourceIds, layers, alignment);
  const digest = contentDigest({ baselineId: input.baseline.id, scope, profile: { id: profile.id, version: profile.version }, layers, alignment, drift, contextPack: { id: contextPack.id, contentDigest: contextPack.contentDigest } });
  return { baselineId: input.baseline.id, architectureScope: scope, profileId: profile.id, profileVersion: profile.version, layers, alignment, drift, contextPack, digest };
}

function buildLayerProjection(
  layer: ArchitectureLayer,
  baselineId: string,
  scope: ArchitectureScopeRef,
  profile: AnalysisProfile,
  sourceRevisionIds: string[],
  assertions: readonly KnowledgeAssertion[],
  relationships: readonly KnowledgeProjectionRelationship[]
): KnowledgeLayerProjection {
  const nodes = assertions.filter((assertion) => assertion.layer === layer).map(toNode).sort((left, right) => left.id.localeCompare(right.id));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = relationships.filter((relationship) => nodeIds.has(relationship.sourceAssertionId) && nodeIds.has(relationship.targetAssertionId)).map(toEdge).sort(compareEdges);
  const projection = { layer, baselineId, profileId: profile.id, profileVersion: profile.version, sourceRevisionIds, nodes, edges };
  return { ...projection, digest: contentDigest(projection) };
}

function buildAlignment(baselineId: string, assertions: readonly KnowledgeAssertion[], relationships: readonly KnowledgeProjectionRelationship[]): KnowledgeAlignmentProjection {
  const byId = new Map(assertions.map((assertion) => [assertion.id, assertion]));
  const items = relationships
    .map((relationship) => ({ relationship, source: byId.get(relationship.sourceAssertionId), target: byId.get(relationship.targetAssertionId) }))
    .filter((item): item is { relationship: KnowledgeProjectionRelationship; source: KnowledgeAssertion; target: KnowledgeAssertion } => Boolean(item.source && item.target && item.source.layer !== item.target.layer))
    .map(({ relationship, source, target }) => ({ relationshipId: relationship.id, sourceLayer: source.layer, targetLayer: target.layer, sourceAssertionId: source.id, targetAssertionId: target.id, code: relationship.code, confidence: relationship.confidence }))
    .sort((left, right) => `${left.sourceAssertionId}:${left.targetAssertionId}:${left.code}`.localeCompare(`${right.sourceAssertionId}:${right.targetAssertionId}:${right.code}`));
  const aligned = new Set(items.flatMap((item) => [item.sourceAssertionId, item.targetAssertionId]));
  const unalignedAssertionIds = assertions.filter((assertion) => !aligned.has(assertion.id)).map((assertion) => assertion.id).sort();
  const projection = { baselineId, items, unalignedAssertionIds };
  return { ...projection, digest: contentDigest(projection) };
}

function buildDrift(baselineId: string, scope: ArchitectureScopeRef, baseline: readonly KnowledgeAssertion[], current: readonly KnowledgeAssertion[]): KnowledgeDriftProjection {
  const baselineByIdentity = indexByIdentity(baseline, scope);
  const currentByIdentity = indexByIdentity(current, scope);
  const identities = [...new Set([...baselineByIdentity.keys(), ...currentByIdentity.keys()])].sort();
  const items = identities.map((semanticIdentity) => {
    const before = baselineByIdentity.get(semanticIdentity);
    const after = currentByIdentity.get(semanticIdentity);
    const baselineDigest = before ? assertionDigest(before) : undefined;
    const currentDigest = after ? assertionDigest(after) : undefined;
    const kind: KnowledgeDriftKind = !before ? "ADDED" : !after ? "REMOVED" : baselineDigest === currentDigest ? "UNCHANGED" : "CHANGED";
    return { semanticIdentity, baselineAssertionId: before?.id, currentAssertionId: after?.id, layer: after?.layer ?? before!.layer, kind, baselineDigest, currentDigest };
  });
  const projection = { baselineId, items };
  return { ...projection, digest: contentDigest(projection) };
}

function buildContextPack(baselineId: string, scope: ArchitectureScopeRef, profile: AnalysisProfile, sourceRevisionIds: string[], layers: Record<ArchitectureLayer, KnowledgeLayerProjection>, alignment: KnowledgeAlignmentProjection): PinnedKnowledgeContextPack {
  const id = `context-pack:3a:${baselineId}:${profile.id}:${profile.version}`;
  const lines = [`# SpecForge 3A Context Pack`, ``, `- Baseline: ${baselineId}`, `- Profile: ${profile.id}@${profile.version}`, `- Application service: ${scope.applicationServiceId}`, `- Scope path: ${scope.scopePath}`, ``, `## Layers`];
  for (const layer of ["BIZ", "SYS", "TECH"] as const) {
    lines.push(`### ${layer}`);
    for (const node of layers[layer].nodes) lines.push(`- ${node.factType} \`${node.semanticIdentity}\` (${node.aspect}, confidence ${node.confidence})`);
    if (layers[layer].nodes.length === 0) lines.push("- No accepted facts.");
  }
  lines.push(``, `## Cross-layer alignment`, ...alignment.items.map((item) => `- ${item.sourceLayer}:${item.sourceAssertionId} -[${item.code}]-> ${item.targetLayer}:${item.targetAssertionId}`));
  const content = lines.join("\n");
  const contentDigestValue = contentDigest({ id, scope, sourceRevisionIds, content });
  return { id, baselineId, profileId: profile.id, profileVersion: profile.version, architectureScope: scope, sourceRevisionIds, contentDigest: contentDigestValue, markdown: content };
}

function indexByIdentity(assertions: readonly KnowledgeAssertion[], scope: ArchitectureScopeRef): Map<string, KnowledgeAssertion> {
  const result = new Map<string, KnowledgeAssertion>();
  for (const assertion of assertions) {
    assertExactScope(assertion.architectureScope, scope);
    if (assertion.status === "ACCEPTED") {
      const existing = result.get(assertion.semanticIdentity);
      if (!existing || assertion.revision > existing.revision || (assertion.revision === existing.revision && assertion.id > existing.id)) result.set(assertion.semanticIdentity, assertion);
    }
  }
  return result;
}

function toNode(assertion: KnowledgeAssertion): ProjectedKnowledgeNode {
  return { id: assertion.id, semanticIdentity: assertion.semanticIdentity, factType: assertion.factType, layer: assertion.layer, aspect: assertion.aspect, status: assertion.status, confidence: assertion.confidence, ...(assertion.domainCluster ? { domainCluster: assertion.domainCluster } : {}), value: assertion.value, evidenceRefs: [...assertion.evidenceRefs].sort() };
}

function toEdge(relationship: KnowledgeProjectionRelationship): ProjectedKnowledgeEdge {
  return { id: relationship.id, sourceAssertionId: relationship.sourceAssertionId, targetAssertionId: relationship.targetAssertionId, code: relationship.code, confidence: relationship.confidence };
}

function compareEdges(left: ProjectedKnowledgeEdge, right: ProjectedKnowledgeEdge): number {
  return `${left.sourceAssertionId}:${left.targetAssertionId}:${left.code}`.localeCompare(`${right.sourceAssertionId}:${right.targetAssertionId}:${right.code}`);
}

function assertionDigest(assertion: KnowledgeAssertion): string {
  return contentDigest({ semanticIdentity: assertion.semanticIdentity, factType: assertion.factType, layer: assertion.layer, aspect: assertion.aspect, value: assertion.value, confidence: assertion.confidence, evidenceRefs: [...assertion.evidenceRefs].sort() });
}
