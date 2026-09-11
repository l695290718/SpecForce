import { MultiDirectedGraph } from "graphology";
import type { FeatureGraphResponse } from "../../lib/features";

export interface FeatureGraphNodeAttributes { label: string; fullLabel: string; nodeType: string; logicalId: string; summary: string; x: number; y: number; size: number; color: string; hidden: boolean; }
export interface FeatureGraphEdgeAttributes { relationType: string; label: string; color: string; size: number; hidden: boolean; }
export type FeatureGraph = MultiDirectedGraph<FeatureGraphNodeAttributes, FeatureGraphEdgeAttributes>;

export const featureGraphColors: Record<string, string> = { serviceFeature: "#2563eb", functionalFeature: "#7c3aed", api: "#0891b2", apiOperation: "#06b6d4", dataModel: "#059669", dataEntity: "#10b981", dataField: "#34d399", event: "#db2777", businessRule: "#d97706", stateMachine: "#ea580c", quality: "#475569", observability: "#475569", evidence: "#64748b", adr: "#64748b", proposal: "#64748b", domain: "#64748b" };

export function buildFeatureGraphModel(response: FeatureGraphResponse, options: { visibleTypes?: ReadonlySet<string> } = {}): FeatureGraph {
  const graph = new MultiDirectedGraph<FeatureGraphNodeAttributes, FeatureGraphEdgeAttributes>();
  const count = Math.max(response.nodes.length, 1);
  response.nodes.forEach((node, index) => {
    const position = response.mode === "all" ? circularPosition(index, count) : layeredPosition(node.nodeType, index, response.nodes);
    const hidden = Boolean(options.visibleTypes?.size && !options.visibleTypes.has(node.nodeType));
    graph.addNode(node.id, { label: truncate(node.label, 28), fullLabel: node.label, nodeType: node.nodeType, logicalId: node.logicalId, summary: node.summary ?? "", x: position.x, y: position.y, size: node.nodeType === "serviceFeature" ? 15 : node.nodeType === "functionalFeature" ? 11 : 7, color: featureGraphColors[node.nodeType] ?? "#64748b", hidden });
  });
  response.edges.forEach((edge) => {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) return;
    const hidden = graph.getNodeAttribute(edge.source, "hidden") || graph.getNodeAttribute(edge.target, "hidden");
    graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, { relationType: edge.relationType, label: edge.relationType, color: edge.relationType === "CONTRIBUTES_TO" ? "#6366f1" : "#94a3b8", size: edge.relationType === "CONTRIBUTES_TO" ? 2.2 : 1, hidden });
  });
  return graph;
}

function circularPosition(index: number, count: number): { x: number; y: number } {
  const angle = (Math.PI * 2 * index) / count;
  return { x: Math.cos(angle) * (12 + count / 8), y: Math.sin(angle) * (12 + count / 8) };
}

function layeredPosition(nodeType: string, index: number, nodes: FeatureGraphResponse["nodes"]): { x: number; y: number } {
  const columns: Record<string, number> = { serviceFeature: -34, functionalFeature: -8 };
  const x = columns[nodeType] ?? 24;
  const group = nodes.filter((candidate) => (columns[candidate.nodeType] ?? 24) === x);
  const groupIndex = group.findIndex((candidate) => candidate.id === nodes[index]?.id);
  const spacing = x === 24 ? 9 : 13;
  return { x, y: (groupIndex - (group.length - 1) / 2) * spacing };
}

export function highlightImpactPath(graph: FeatureGraph, source: string, target: string): string[] {
  if (!graph.hasNode(source) || !graph.hasNode(target)) return [];
  const queue = [source];
  const previous = new Map<string, { node: string; edge: string }>();
  const visited = new Set([source]);
  while (queue.length) {
    const current = queue.shift()!;
    if (current === target) break;
    for (const edge of graph.edges(current)) {
      if (graph.getEdgeAttribute(edge, "hidden")) continue;
      const [edgeSource, edgeTarget] = graph.extremities(edge);
      const next = edgeSource === current ? edgeTarget : edgeSource;
      if (visited.has(next)) continue;
      visited.add(next); previous.set(next, { node: current, edge }); queue.push(next);
    }
  }
  if (!visited.has(target)) return [];
  const path: string[] = [];
  for (let cursor = target; cursor !== source;) { const step = previous.get(cursor); if (!step) return []; path.unshift(step.edge); cursor = step.node; }
  return path;
}

function truncate(value: string, max: number): string { return value.length <= max ? value : `${value.slice(0, max - 1)}…`; }
