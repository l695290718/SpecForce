import type { KnowledgeProjectionEdge, KnowledgeProjectionNode } from "@specforge/core";

export type ArchitectureGraphRole = "upstream" | "focus" | "downstream";

export interface PositionedArchitectureNode {
  id: string;
  fact: KnowledgeProjectionNode;
  role: ArchitectureGraphRole;
  depth: number;
  position: { x: number; y: number };
}

export interface PositionedArchitectureEdge {
  id: string;
  edge: KnowledgeProjectionEdge;
}

export interface ArchitectureGraphLayoutInput {
  focusId: string;
  nodes: readonly KnowledgeProjectionNode[];
  edges: readonly KnowledgeProjectionEdge[];
}

export interface ArchitectureGraphLayout {
  nodes: PositionedArchitectureNode[];
  edges: PositionedArchitectureEdge[];
}

const FOCUS_X = 0;
const DEPTH_GAP_X = 320;
const LAYER_Y = { BIZ: 0, SYS: 240, TECH: 480 } as const;
const NODE_GAP_Y = 132;
const LAYER_ORDER = { BIZ: 0, SYS: 1, TECH: 2 } as const;
const ROLE_ORDER = { upstream: 0, focus: 1, downstream: 2 } as const;

export function layoutArchitectureGraph(input: ArchitectureGraphLayoutInput): ArchitectureGraphLayout {
  const nodes = [...new Map(input.nodes.map((node) => [node.assertionId, node])).values()];
  const edges = [...new Map(input.edges.map((edge) => [edge.relationshipIdentity, edge])).values()];
  const nodeIds = new Set(nodes.map((node) => node.assertionId));
  const upstreamDistances = shortestDistances(input.focusId, nodes, edges, "upstream");
  const downstreamDistances = shortestDistances(input.focusId, nodes, edges, "downstream");
  const buckets = new Map<string, PositionedArchitectureNode[]>();

  for (const node of nodes) {
    const assignment = assignmentFor(node, input.focusId, upstreamDistances, downstreamDistances);
    const item: PositionedArchitectureNode = {
      id: node.assertionId,
      fact: node,
      role: assignment.role,
      depth: assignment.depth,
      position: { x: 0, y: LAYER_Y[node.layer] }
    };
    if (assignment.role === "focus") {
      buckets.set(`focus|0|${node.layer}`, [item]);
    } else {
      const key = `${assignment.role}|${assignment.depth}|${node.layer}`;
      buckets.set(key, [...(buckets.get(key) ?? []), item]);
    }
  }

  const positionedNodes = [...buckets.entries()]
    .sort(([left], [right]) => compareBucketKeys(left, right))
    .flatMap(([, bucket]) => {
      bucket.sort(comparePositionedFacts);
      const focus = bucket[0]?.role === "focus";
      return bucket.map((item, index) => ({
        ...item,
        position: focus ? { x: FOCUS_X, y: LAYER_Y[item.fact.layer] } : {
          x: (item.role === "upstream" ? -1 : 1) * item.depth * DEPTH_GAP_X,
          y: LAYER_Y[item.fact.layer] + (index - (bucket.length - 1) / 2) * NODE_GAP_Y
        }
      }));
    });

  const positionedEdges = edges
    .filter((edge) => nodeIds.has(edge.sourceAssertionId) && nodeIds.has(edge.targetAssertionId))
    .sort(compareEdges)
    .map((edge) => ({ id: edge.relationshipIdentity, edge }));

  return { nodes: positionedNodes, edges: positionedEdges };
}

function shortestDistances(focusId: string, nodes: readonly KnowledgeProjectionNode[], edges: readonly KnowledgeProjectionEdge[], direction: "upstream" | "downstream"): Map<string, number> {
  const nodeIds = new Set(nodes.map((node) => node.assertionId));
  const distances = new Map<string, number>([[focusId, 0]]);
  let frontier = [focusId];
  while (frontier.length) {
    const next: string[] = [];
    for (const current of frontier.sort()) {
      const neighbors = edges
        .filter((edge) => direction === "upstream" ? edge.targetAssertionId === current : edge.sourceAssertionId === current)
        .map((edge) => direction === "upstream" ? edge.sourceAssertionId : edge.targetAssertionId)
        .filter((assertionId) => nodeIds.has(assertionId))
        .sort();
      for (const neighbor of neighbors) {
        if (distances.has(neighbor)) continue;
        distances.set(neighbor, (distances.get(current) ?? 0) + 1);
        next.push(neighbor);
      }
    }
    frontier = [...new Set(next)].sort();
  }
  return distances;
}

function assignmentFor(node: KnowledgeProjectionNode, focusId: string, upstream: Map<string, number>, downstream: Map<string, number>): { role: ArchitectureGraphRole; depth: number } {
  if (node.assertionId === focusId) return { role: "focus", depth: 0 };
  const upstreamDepth = upstream.get(node.assertionId);
  const downstreamDepth = downstream.get(node.assertionId);
  if (upstreamDepth !== undefined && (downstreamDepth === undefined || upstreamDepth < downstreamDepth)) return { role: "upstream", depth: upstreamDepth };
  if (downstreamDepth !== undefined) return { role: "downstream", depth: downstreamDepth };
  return { role: "downstream", depth: 1 };
}

function compareBucketKeys(left: string, right: string): number {
  const [leftRole, leftDepth, leftLayer] = left.split("|");
  const [rightRole, rightDepth, rightLayer] = right.split("|");
  return ROLE_ORDER[leftRole as ArchitectureGraphRole] - ROLE_ORDER[rightRole as ArchitectureGraphRole]
    || Number(leftDepth) - Number(rightDepth)
    || LAYER_ORDER[leftLayer as keyof typeof LAYER_ORDER] - LAYER_ORDER[rightLayer as keyof typeof LAYER_ORDER];
}

function comparePositionedFacts(left: PositionedArchitectureNode, right: PositionedArchitectureNode): number {
  return left.fact.sortKey.localeCompare(right.fact.sortKey) || left.id.localeCompare(right.id);
}

function compareEdges(left: KnowledgeProjectionEdge, right: KnowledgeProjectionEdge): number {
  return left.relationshipIdentity.localeCompare(right.relationshipIdentity) || left.sourceAssertionId.localeCompare(right.sourceAssertionId) || left.targetAssertionId.localeCompare(right.targetAssertionId);
}
