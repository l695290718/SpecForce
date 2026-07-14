import { createTraversalPlan, type GraphEvidencePath, type GraphRelationship, type GraphStore, type GraphTraversalPlan, type TraversalAuthorization } from "../graph-store/types";
import { relationshipOntology } from "../relationships/ontology";
import type { AssetNodeIdentity, RelationshipCode, RelationshipStrength } from "../relationships/types";
import type { ArchitectureScopeRef } from "../architecture/types";
import type { AssetRef, GovernanceCheckResult, ImpactAnalysis, Proposal } from "../types";

export type ProposalChangeType =
  | "ADD"
  | "MODIFY"
  | "DELETE"
  | "RENAME"
  | "TYPE_CHANGE"
  | "CONSTRAINT_CHANGE"
  | "SECURITY_CHANGE"
  | "BEHAVIOR_CHANGE";

export type ImpactCertainty = "DIRECT" | "DEFINITE" | "POSSIBLE" | "CONTEXTUAL" | "NOT_IMPACTED";
export type ImpactLevel = "low" | "medium" | "high";

export interface NormalizedProposalChanges {
  changes: ProposalChangeType[];
  roots: AssetNodeIdentity[];
}

export interface ProposalImpactInput {
  proposal: Proposal;
  roots: AssetNodeIdentity[];
  authorization: TraversalAuthorization;
  maxDepth?: number;
  maxNodes?: number;
  maxPaths?: number;
  timeoutMs?: number;
  graphVersion?: bigint;
}

export interface ProposalImpactDependencies {
  graphStore: Pick<GraphStore, "traverse">;
  governanceWarnings?: GovernanceCheckResult[];
}

export interface ImpactedNode {
  node: AssetNodeIdentity;
  impactLevel: ImpactLevel;
  certainty: ImpactCertainty;
  depth: number;
  primaryPath: GraphEvidencePath;
  alternativePaths: GraphEvidencePath[];
  matchedRules: RelationshipCode[];
  confidence: number;
  recommendedActions: string[];
  scope: ArchitectureScopeRef;
}

export interface TransitiveProposalImpact extends ImpactAnalysis {
  changes: ProposalChangeType[];
  nodes: ImpactedNode[];
  status: "COMPLETE" | "PARTIAL";
  frontier: AssetNodeIdentity[];
  truncationReasons: string[];
  graphVersion: bigint;
  elapsedMs: number;
}

interface RankedPath {
  path: GraphEvidencePath;
  certainty: ImpactCertainty;
  strength: number;
  confidence: number;
}

const certaintyRank: Record<ImpactCertainty, number> = {
  DIRECT: 5,
  DEFINITE: 4,
  POSSIBLE: 3,
  CONTEXTUAL: 2,
  NOT_IMPACTED: 1
};

const strengthRank: Record<RelationshipStrength, number> = { strong: 3, medium: 2, weak: 1 };
const contextualCodes = new Set<RelationshipCode>(["GOVERNS", "VERIFIES", "OBSERVES", "DECIDES"]);
const contextualNodeTypes = new Set<AssetNodeIdentity["nodeType"]>(["businessRule", "quality", "observability", "adr"]);

export function normalizeProposalChanges(proposal: Proposal, roots: AssetNodeIdentity[]): NormalizedProposalChanges {
  const changes = new Set<ProposalChangeType>();

  for (const specChange of proposal.specChanges) {
    const value = specChange.toLowerCase();
    if (/\b(add|create|new)\b|新增|添加/.test(value)) changes.add("ADD");
    if (/\b(delete|remove|drop)\b|删除|移除/.test(value)) changes.add("DELETE");
    if (/\b(rename)\b|重命名/.test(value)) changes.add("RENAME");
    if (/\b(type|schema)\b|类型/.test(value)) changes.add("TYPE_CHANGE");
    if (/\b(constraint|validation)\b|约束|校验/.test(value)) changes.add("CONSTRAINT_CHANGE");
    if (/\b(security|auth|authorization|permission)\b|安全|权限/.test(value)) changes.add("SECURITY_CHANGE");
    if (/\b(behavior|semantic|workflow|state)\b|行为|语义|流程|状态/.test(value)) changes.add("BEHAVIOR_CHANGE");
  }

  if (changes.size === 0) changes.add("MODIFY");
  return { changes: [...changes], roots: [...roots] };
}

export function buildProposalImpactTraversalPlan(input: ProposalImpactInput): GraphTraversalPlan {
  return createTraversalPlan({
    startNodes: input.roots,
    authorization: input.authorization,
    relationRules: [...relationshipOntology.values()].map((definition) => ({
      code: definition.code,
      forwardPropagation: definition.forwardPropagation,
      reversePropagation: definition.reversePropagation
    })),
    maxDepth: input.maxDepth ?? 2,
    maxNodes: input.maxNodes ?? 1_000,
    maxPaths: input.maxPaths ?? 1_000,
    timeoutMs: input.timeoutMs ?? 3_000,
    graphVersion: input.graphVersion
  });
}

export async function analyzeTransitiveProposalImpact(
  input: ProposalImpactInput,
  dependencies: ProposalImpactDependencies
): Promise<TransitiveProposalImpact> {
  const normalized = normalizeProposalChanges(input.proposal, input.roots);
  const traversal = await dependencies.graphStore.traverse(buildProposalImpactTraversalPlan(input));
  const rankedByNode = new Map<string, RankedPath[]>();

  for (const path of evidencePathPrefixes(traversal.paths)) {
    const node = path.nodes.at(-1);
    if (!node) continue;
    const key = nodeKey(node);
    const paths = rankedByNode.get(key) ?? [];
    paths.push(rankPath(path, normalized.roots));
    rankedByNode.set(key, paths);
  }

  for (const root of normalized.roots) {
    const key = nodeKey(root);
    if (!rankedByNode.has(key)) rankedByNode.set(key, [rankPath({ nodes: [root], edges: [] }, normalized.roots)]);
  }

  for (const node of traversal.nodes) {
    const key = nodeKey(node);
    if (!rankedByNode.has(key)) rankedByNode.set(key, [rankPath({ nodes: [node], edges: [] }, normalized.roots)]);
  }

  const nodes = [...rankedByNode.values()]
    .map((paths) => toImpactedNode(paths, normalized.changes))
    .sort(compareImpactedNodes);
  const impactedAssets = toAssetRefs(nodes);
  const riskLevel = nodes.reduce<ImpactLevel>((current, node) => impactLevelRank(node.impactLevel) > impactLevelRank(current) ? node.impactLevel : current, "low");

  return {
    proposalId: input.proposal.id,
    impactedAssetCount: impactedAssets.length,
    impactedAssets,
    affectedDomains: [],
    riskLevel,
    requiredContextPack: impactedAssets.some((asset) => asset.type === "api" || asset.type === "event"),
    governanceWarnings: dependencies.governanceWarnings ?? [],
    implementationTasks: input.proposal.specChanges.map((change) => `Implement proposal specification change: ${change}`),
    affectedArchitectureScopes: uniqueScopes(nodes.map((node) => node.scope)),
    changes: normalized.changes,
    nodes,
    status: traversal.status,
    frontier: traversal.frontier,
    truncationReasons: traversal.truncationReasons,
    graphVersion: traversal.graphVersion,
    elapsedMs: traversal.elapsedMs
  };
}

export const previewProposalImpact = analyzeTransitiveProposalImpact;

function evidencePathPrefixes(paths: GraphEvidencePath[]): GraphEvidencePath[] {
  return paths.flatMap((path) => {
    const maxLength = Math.min(path.nodes.length, path.edges.length + 1);
    return Array.from({ length: maxLength }, (_, index) => ({
      nodes: path.nodes.slice(0, index + 1),
      edges: path.edges.slice(0, index)
    }));
  });
}

function rankPath(path: GraphEvidencePath, roots: AssetNodeIdentity[]): RankedPath {
  const terminal = path.nodes.at(-1)!;
  const direct = path.edges.length === 0 && roots.some((root) => nodeKey(root) === nodeKey(terminal));
  const contextual = path.edges.some((edge) => contextualCodes.has(edge.code)) || contextualNodeTypes.has(terminal.nodeType);
  const strength = path.edges.reduce((minimum, edge) => Math.min(minimum, strengthRank[edge.strength]), 3);
  const confidence = path.edges.reduce((minimum, edge) => Math.min(minimum, edge.confidence), 1);
  const certainty: ImpactCertainty = direct
    ? "DIRECT"
    : contextual
      ? "CONTEXTUAL"
      : strength === 1 || confidence < 0.8
        ? "POSSIBLE"
        : "DEFINITE";

  return { path, certainty, strength, confidence };
}

function toImpactedNode(paths: RankedPath[], changes: ProposalChangeType[]): ImpactedNode {
  const deduplicated = [...new Map(paths.map((candidate) => [pathKey(candidate.path), candidate])).values()].sort(compareRankedPaths);
  const primary = deduplicated[0]!;
  const node = primary.path.nodes.at(-1)!;
  const matchedRules = [...new Set(primary.path.edges.map((edge) => edge.code))];

  return {
    node,
    impactLevel: deriveImpactLevel(primary, changes),
    certainty: primary.certainty,
    depth: primary.path.edges.length,
    primaryPath: primary.path,
    alternativePaths: deduplicated.slice(1, 4).map((candidate) => candidate.path),
    matchedRules,
    confidence: primary.confidence,
    recommendedActions: recommendedActions(primary.certainty),
    scope: { applicationServiceId: node.applicationServiceId, scopePath: node.scopePath }
  };
}

function deriveImpactLevel(path: RankedPath, changes: ProposalChangeType[]): ImpactLevel {
  if (path.certainty === "NOT_IMPACTED" || path.certainty === "CONTEXTUAL") return "low";
  if (path.certainty === "POSSIBLE") return "medium";
  if (path.certainty === "DIRECT" && !hasBreakingChange(changes)) return "medium";
  return path.strength >= 3 || hasBreakingChange(changes) ? "high" : "medium";
}

function hasBreakingChange(changes: ProposalChangeType[]): boolean {
  return changes.some((change) => change === "DELETE" || change === "TYPE_CHANGE" || change === "CONSTRAINT_CHANGE" || change === "SECURITY_CHANGE" || change === "BEHAVIOR_CHANGE");
}

function recommendedActions(certainty: ImpactCertainty): string[] {
  if (certainty === "CONTEXTUAL") return ["Review this contextual design evidence."];
  if (certainty === "POSSIBLE") return ["Confirm whether this dependency is affected."];
  if (certainty === "NOT_IMPACTED") return ["No action is required under the matched rule."];
  return ["Plan and validate the dependent change."];
}

function toAssetRefs(nodes: ImpactedNode[]): AssetRef[] {
  return [...new Map(nodes
    .filter((node) => node.certainty !== "NOT_IMPACTED")
    .map((node) => {
      const ref: AssetRef = {
        type: node.node.rootAssetType,
        id: node.node.rootAssetId,
        label: node.node.rootAssetId
      };
      return [`${ref.type}/${ref.id}`, ref] as const;
    }))
    .values()];
}

function uniqueScopes(scopes: ArchitectureScopeRef[]): ArchitectureScopeRef[] {
  return [...new Map(scopes.map((scope) => [`${scope.applicationServiceId}/${scope.scopePath}`, scope])).values()];
}

function compareImpactedNodes(left: ImpactedNode, right: ImpactedNode): number {
  return compareRankedPaths(rankPath(left.primaryPath, []), rankPath(right.primaryPath, [])) || nodeKey(left.node).localeCompare(nodeKey(right.node));
}

function compareRankedPaths(left: RankedPath, right: RankedPath): number {
  return certaintyRank[right.certainty] - certaintyRank[left.certainty]
    || right.strength - left.strength
    || right.confidence - left.confidence
    || left.path.edges.length - right.path.edges.length
    || pathKey(left.path).localeCompare(pathKey(right.path));
}

function impactLevelRank(level: ImpactLevel): number {
  return { low: 1, medium: 2, high: 3 }[level];
}

function nodeKey(node: AssetNodeIdentity): string {
  return [node.applicationServiceId, node.scopePath, node.nodeType, node.logicalId].join("|");
}

function pathKey(path: GraphEvidencePath): string {
  return `${path.nodes.map(nodeKey).join(">")}:${path.edges.map((edge) => edge.id).join(",")}`;
}
