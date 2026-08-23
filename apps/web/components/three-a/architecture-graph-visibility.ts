import type { GraphSemanticEdge, GraphSemanticNode } from "./architecture-graph-store";

export interface GraphSnapshot {
  nodes: readonly GraphSemanticNode[];
  edges: readonly GraphSemanticEdge[];
}

export interface VisibleArchitectureGraph {
  nodeIds: ReadonlySet<string>;
  edgeIds: ReadonlySet<string>;
}

interface ClusterCandidate {
  id: string;
  layer: "BIZ" | "SYS" | "TECH";
  memberIds: readonly string[];
  relationshipDegree: number;
}

const ARCHITECTURE_LAYERS = ["BIZ", "SYS", "TECH"] as const;
const DEFAULT_VISIBLE_MEMBER_LIMIT = 36;

export function defaultExpandedClusterIds(
  nodes: readonly GraphSemanticNode[],
  edges: readonly GraphSemanticEdge[],
  maxVisibleMembers = DEFAULT_VISIBLE_MEMBER_LIMIT
): ReadonlySet<string> {
  const memberLimit = Math.max(0, Math.floor(maxVisibleMembers));
  const candidates = clusterCandidates(nodes, edges);
  const expanded = new Set<string>();
  let visibleMembers = 0;

  const add = (candidate: ClusterCandidate | undefined) => {
    if (!candidate || expanded.has(candidate.id) || visibleMembers + candidate.memberIds.length > memberLimit) return;
    expanded.add(candidate.id);
    visibleMembers += candidate.memberIds.length;
  };

  for (const layer of ARCHITECTURE_LAYERS) {
    add(candidates.find((candidate) => candidate.layer === layer && candidate.relationshipDegree > 0));
  }
  for (const candidate of candidates) add(candidate);
  return expanded;
}

export function deriveVisibleArchitectureGraph(
  snapshot: GraphSnapshot,
  expandedClusterIds: ReadonlySet<string>
): VisibleArchitectureGraph {
  const nodeIds = new Set<string>();
  for (const node of snapshot.nodes) {
    if (node.attributes.kind === "cluster" || !node.attributes.clusterId || expandedClusterIds.has(node.attributes.clusterId)) nodeIds.add(node.id);
  }
  const edgeIds = new Set<string>();
  for (const edge of snapshot.edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) edgeIds.add(edge.id);
  }
  return { nodeIds, edgeIds };
}

function clusterCandidates(nodes: readonly GraphSemanticNode[], edges: readonly GraphSemanticEdge[]): ClusterCandidate[] {
  const memberIdsByCluster = new Map<string, string[]>();
  const layerByCluster = new Map<string, "BIZ" | "SYS" | "TECH">();
  for (const node of nodes) {
    const { clusterId, kind, layer } = node.attributes;
    if (kind === "cluster" && clusterId && isArchitectureLayer(layer)) layerByCluster.set(clusterId, layer);
    if (kind === "fact" && clusterId && isArchitectureLayer(layer)) {
      const members = memberIdsByCluster.get(clusterId) ?? [];
      members.push(node.id);
      memberIdsByCluster.set(clusterId, members);
      layerByCluster.set(clusterId, layer);
    }
  }
  const clusterByMemberId = new Map<string, string>();
  for (const [clusterId, memberIds] of memberIdsByCluster) for (const memberId of memberIds) clusterByMemberId.set(memberId, clusterId);
  const relationshipDegree = new Map<string, number>();
  for (const edge of edges) {
    if (edge.attributes.relationCode === "ARCHITECTURE_MEMBERSHIP") continue;
    for (const endpoint of [edge.source, edge.target]) {
      const clusterId = clusterByMemberId.get(endpoint);
      if (clusterId) relationshipDegree.set(clusterId, (relationshipDegree.get(clusterId) ?? 0) + 1);
    }
  }
  return [...memberIdsByCluster.entries()]
    .flatMap(([id, memberIds]) => {
      const layer = layerByCluster.get(id);
      return layer ? [{ id, layer, memberIds: [...memberIds].sort(), relationshipDegree: relationshipDegree.get(id) ?? 0 }] : [];
    })
    .sort((left, right) => right.relationshipDegree - left.relationshipDegree || right.memberIds.length - left.memberIds.length || left.id.localeCompare(right.id));
}

function isArchitectureLayer(layer: GraphSemanticNode["attributes"]["layer"]): layer is "BIZ" | "SYS" | "TECH" {
  return layer === "BIZ" || layer === "SYS" || layer === "TECH";
}
