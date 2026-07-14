import {
  createGraphTraversalResult,
  type AssetNodeIdentity,
  type GraphEvidencePath,
  type GraphProjectionBatch,
  type GraphRelationship,
  type GraphStore,
  type GraphTraversalPlan,
  type GraphTraversalResult,
  type GraphTraversalTruncationReason
} from "@specforge/core";

export interface GraphProjectionSnapshot {
  nodes: AssetNodeIdentity[];
  edges: GraphRelationship[];
  graphVersion: bigint;
}

export interface TraversalOptions {
  now?: () => number;
}

interface PathState {
  node: AssetNodeIdentity;
  nodes: AssetNodeIdentity[];
  edges: GraphRelationship[];
  visited: Set<string>;
  depth: number;
}

export function traverseSnapshot(plan: GraphTraversalPlan, snapshot: GraphProjectionSnapshot, options: TraversalOptions = {}): GraphTraversalResult {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const scope = plan.authorizedScope;
  const allowedNodes = snapshot.nodes.filter((node) => sameScope(node, scope));
  const nodeByKey = new Map(allowedNodes.map((node) => [nodeKey(node), node]));
  const edges = snapshot.edges
    .filter((edge) => sameScope(edge.source, scope) && sameScope(edge.target, scope))
    .filter((edge) => nodeByKey.has(nodeKey(edge.source)) && nodeByKey.has(nodeKey(edge.target)))
    .sort(compareEdges);
  const requestedStartNodes = [...plan.startNodes]
    .map((node) => nodeByKey.get(nodeKey(node)))
    .filter((node): node is AssetNodeIdentity => node !== undefined)
    .sort(compareNodes);
  const startLimit = Math.min(plan.maxNodes, plan.maxPaths);
  const startNodes = requestedStartNodes.slice(0, startLimit);
  const resultNodes = new Map(startNodes.map((node) => [nodeKey(node), node]));
  const resultEdges = new Map<string, GraphRelationship>();
  const paths: GraphEvidencePath[] = startNodes.map((node) => ({ nodes: [node], edges: [] }));
  const queue: PathState[] = startNodes.map((node) => ({ node, nodes: [node], edges: [], visited: new Set([nodeKey(node)]), depth: 0 }));
  const frontier: AssetNodeIdentity[] = [];
  const reasons = new Set<GraphTraversalTruncationReason>();

  const initialReasons: GraphTraversalTruncationReason[] = [];
  if (requestedStartNodes.length > plan.maxNodes) initialReasons.push("MAX_NODES");
  if (requestedStartNodes.length > plan.maxPaths) initialReasons.push("MAX_PATHS");
  if (initialReasons.length > 0) {
    return partialResult(requestedStartNodes.slice(startLimit), initialReasons, resultNodes, resultEdges, paths, snapshot.graphVersion, elapsed(now, startedAt));
  }

  while (queue.length > 0) {
    if (elapsed(now, startedAt) >= plan.timeoutMs) {
      reasons.add("TIMEOUT");
      frontier.push(...queue.map((state) => state.node));
      break;
    }

    const state = queue.shift()!;
    const next = transitions(state.node, plan, edges);
    const unvisited = next.filter((transition) => !state.visited.has(nodeKey(transition.node)));
    if (unvisited.length === 0) continue;

    if (state.depth >= plan.maxDepth) {
      reasons.add("MAX_DEPTH");
      frontier.push(state.node);
      continue;
    }

    for (const transition of unvisited) {
      if (elapsed(now, startedAt) >= plan.timeoutMs) {
        reasons.add("TIMEOUT");
        frontier.push(state.node, ...queue.map((item) => item.node));
        queue.length = 0;
        break;
      }
      const key = nodeKey(transition.node);
      if (!resultNodes.has(key) && resultNodes.size >= plan.maxNodes) {
        reasons.add("MAX_NODES");
        frontier.push(state.node, ...queue.map((item) => item.node));
        queue.length = 0;
        break;
      }
      if (paths.length >= plan.maxPaths) {
        reasons.add("MAX_PATHS");
        frontier.push(state.node, ...queue.map((item) => item.node));
        queue.length = 0;
        break;
      }

      resultNodes.set(key, transition.node);
      resultEdges.set(transition.edge.id, transition.edge);
      const nextState: PathState = {
        node: transition.node,
        nodes: [...state.nodes, transition.node],
        edges: [...state.edges, transition.edge],
        visited: new Set([...state.visited, key]),
        depth: state.depth + 1
      };
      paths.push({ nodes: nextState.nodes, edges: nextState.edges });
      queue.push(nextState);
    }
  }

  if (reasons.size === 0) {
    return createGraphTraversalResult({
      status: "COMPLETE",
      nodes: [...resultNodes.values()].sort(compareNodes),
      edges: [...resultEdges.values()].sort(compareEdges),
      paths: paths.sort(comparePaths),
      graphVersion: snapshot.graphVersion,
      elapsedMs: elapsed(now, startedAt)
    });
  }

  return partialResult(frontier, [...reasons], resultNodes, resultEdges, paths, snapshot.graphVersion, elapsed(now, startedAt));
}

export function snapshotStore(snapshot: GraphProjectionSnapshot, options: TraversalOptions): Pick<GraphStore, "traverse"> {
  return { traverse: async (plan) => traverseSnapshot(plan, snapshot, options) };
}

export function sameScope(left: Pick<AssetNodeIdentity, "applicationServiceId" | "scopePath">, right: Pick<AssetNodeIdentity, "applicationServiceId" | "scopePath">): boolean {
  return left.applicationServiceId === right.applicationServiceId && left.scopePath === right.scopePath;
}

export function assertProjectionScope(batch: GraphProjectionBatch): void {
  if (
    batch.nodes.some((node) => !sameScope(node, batch.scope)) ||
    batch.edges.some((edge) => !sameScope(edge.source, batch.scope) || !sameScope(edge.target, batch.scope))
  ) {
    throw new Error("PROJECTION_SCOPE_MISMATCH");
  }
}

export function nodeKey(node: Pick<AssetNodeIdentity, "applicationServiceId" | "scopePath" | "nodeType" | "logicalId">): string {
  return [node.applicationServiceId, node.scopePath, node.nodeType, node.logicalId].join("\u0000");
}

function transitions(node: AssetNodeIdentity, plan: GraphTraversalPlan, edges: GraphRelationship[]): Array<{ edge: GraphRelationship; node: AssetNodeIdentity }> {
  return edges.flatMap((edge) => {
    const rule = plan.relationRules.find((candidate) => candidate.code === edge.code);
    if (!rule || edge.confidence < (rule.minConfidence ?? 0)) return [];
    if (nodeKey(edge.source) === nodeKey(node) && rule.forwardPropagation) return [{ edge, node: edge.target }];
    if (nodeKey(edge.target) === nodeKey(node) && rule.reversePropagation) return [{ edge, node: edge.source }];
    return [];
  }).sort((left, right) => compareNodes(left.node, right.node) || compareEdges(left.edge, right.edge));
}

function partialResult(
  frontier: AssetNodeIdentity[],
  reasons: GraphTraversalTruncationReason[],
  nodes: Map<string, AssetNodeIdentity>,
  edges: Map<string, GraphRelationship>,
  paths: Array<{ nodes: AssetNodeIdentity[]; edges: GraphRelationship[] }>,
  graphVersion: bigint,
  elapsedMs: number
): GraphTraversalResult {
  const uniqueFrontier = [...new Map(frontier.map((node) => [nodeKey(node), node])).values()].sort(compareNodes);
  return createGraphTraversalResult({
    status: "PARTIAL",
    frontier: uniqueFrontier.length > 0 ? [uniqueFrontier[0]!, ...uniqueFrontier.slice(1)] : [nodes.values().next().value!],
    truncationReasons: [...new Set(reasons)].sort() as [GraphTraversalTruncationReason, ...GraphTraversalTruncationReason[]],
    nodes: [...nodes.values()].sort(compareNodes),
    edges: [...edges.values()].sort(compareEdges),
    paths: paths.sort(comparePaths),
    graphVersion,
    elapsedMs
  });
}

function elapsed(now: () => number, startedAt: number): number {
  return Math.max(0, now() - startedAt);
}

function compareNodes(left: AssetNodeIdentity, right: AssetNodeIdentity): number {
  return nodeKey(left).localeCompare(nodeKey(right));
}

function compareEdges(left: GraphRelationship, right: GraphRelationship): number {
  return [left.id, nodeKey(left.source), nodeKey(left.target), left.code].join("\u0000").localeCompare([right.id, nodeKey(right.source), nodeKey(right.target), right.code].join("\u0000"));
}

function comparePaths(left: { nodes: AssetNodeIdentity[]; edges: GraphRelationship[] }, right: { nodes: AssetNodeIdentity[]; edges: GraphRelationship[] }): number {
  return left.nodes.map(nodeKey).join("\u0001").localeCompare(right.nodes.map(nodeKey).join("\u0001"));
}
