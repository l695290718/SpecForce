import { MultiDirectedGraph } from "graphology";
import type { FeatureGraphResponse } from "../../lib/features";

export interface FeatureGraphNodeAttributes { label: string; fullLabel: string; nodeType: string; logicalId: string; summary: string; x: number; y: number; size: number; color: string; hidden: boolean; }
export interface FeatureGraphEdgeAttributes { relationType: string; label: string; color: string; size: number; hidden: boolean; }
export type FeatureGraph = MultiDirectedGraph<FeatureGraphNodeAttributes, FeatureGraphEdgeAttributes>;

const colors: Record<string, string> = { serviceFeature: "#2563eb", functionalFeature: "#7c3aed", api: "#0891b2", apiOperation: "#06b6d4", dataModel: "#059669", dataEntity: "#10b981", dataField: "#34d399", event: "#db2777", businessRule: "#d97706", stateMachine: "#ea580c", quality: "#475569", evidence: "#64748b" };

export function buildFeatureGraphModel(response: FeatureGraphResponse, options: { visibleTypes?: ReadonlySet<string> } = {}): FeatureGraph {
  const graph = new MultiDirectedGraph<FeatureGraphNodeAttributes, FeatureGraphEdgeAttributes>();
  const count = Math.max(response.nodes.length, 1);
  response.nodes.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / count;
    const hidden = Boolean(options.visibleTypes?.size && !options.visibleTypes.has(node.nodeType));
    graph.addNode(node.id, { label: truncate(node.label, 34), fullLabel: node.label, nodeType: node.nodeType, logicalId: node.logicalId, summary: node.summary ?? "", x: Math.cos(angle) * (8 + count / 10), y: Math.sin(angle) * (8 + count / 10), size: node.nodeType === "serviceFeature" ? 13 : node.nodeType === "functionalFeature" ? 10 : 6, color: colors[node.nodeType] ?? "#64748b", hidden });
  });
  response.edges.forEach((edge) => {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) return;
    const hidden = graph.getNodeAttribute(edge.source, "hidden") || graph.getNodeAttribute(edge.target, "hidden");
    graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, { relationType: edge.relationType, label: edge.relationType, color: edge.relationType === "CONTRIBUTES_TO" ? "#6366f1" : "#94a3b8", size: edge.relationType === "CONTRIBUTES_TO" ? 2.2 : 1, hidden });
  });
  return graph;
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
