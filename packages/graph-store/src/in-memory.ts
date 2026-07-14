import type { ArchitectureScopeRef, GraphProjectionBatch, GraphStore, ProjectionReceipt } from "@specforge/core";
import { sameScope, snapshotStore, type GraphProjectionSnapshot, type TraversalOptions } from "./traversal";

export class InMemoryGraphStore implements GraphStore {
  private snapshot: GraphProjectionSnapshot;
  private readonly options: TraversalOptions;

  constructor(initial: GraphProjectionSnapshot = { nodes: [], edges: [], graphVersion: 0n }, options: TraversalOptions = {}) {
    this.snapshot = { nodes: [...initial.nodes], edges: [...initial.edges], graphVersion: initial.graphVersion };
    this.options = options;
  }

  async traverse(plan: Parameters<GraphStore["traverse"]>[0]) {
    return snapshotStore(this.snapshot, this.options).traverse(plan);
  }

  async upsertProjection(batch: GraphProjectionBatch): Promise<ProjectionReceipt> {
    if (batch.nodes.some((node) => !sameScope(node, batch.scope)) || batch.edges.some((edge) => !sameScope(edge.source, batch.scope) || !sameScope(edge.target, batch.scope))) {
      throw new Error("PROJECTION_SCOPE_MISMATCH");
    }
    const retainedNodes = this.snapshot.nodes.filter((node) => !sameScope(node, batch.scope));
    const retainedEdges = this.snapshot.edges.filter((edge) => !sameScope(edge.source, batch.scope) || !sameScope(edge.target, batch.scope));
    this.snapshot = { nodes: [...retainedNodes, ...batch.nodes], edges: [...retainedEdges, ...batch.edges], graphVersion: batch.graphVersion };
    return { graphVersion: batch.graphVersion, projectedNodeCount: batch.nodes.length, projectedEdgeCount: batch.edges.length };
  }

  async checkpoint(scope: ArchitectureScopeRef): Promise<bigint> {
    return this.snapshot.nodes.some((node) => sameScope(node, scope)) ? this.snapshot.graphVersion : 0n;
  }
}
