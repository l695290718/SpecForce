"use client";

import React from "react";
import "@xyflow/react/dist/style.css";
import { Background, Controls, MiniMap, ReactFlow, type Edge, type EdgeMouseHandler, type Node, type NodeMouseHandler } from "@xyflow/react";
import type { KnowledgeProjectionEdge } from "@specforge/core";
import type { ArchitectureGraphLayout } from "./architecture-graph-layout";
import { ArchitectureGraphNode, type ArchitectureGraphFlowNode } from "./architecture-graph-node";

const nodeTypes = { architecture: ArchitectureGraphNode };

export function ArchitectureGraphCanvas({ layout, selectedId, onNodeSelect, onEdgeSelect }: { layout: ArchitectureGraphLayout; selectedId: string; onNodeSelect: (assertionId: string) => void; onEdgeSelect: (edge: KnowledgeProjectionEdge) => void }) {
  const nodes: Node[] = layout.nodes.map((item) => ({ id: item.id, type: "architecture", position: item.position, data: { fact: item.fact, role: item.role, roleLabel: item.role, onSelect: () => onNodeSelect(item.id) }, selected: item.id === selectedId } satisfies ArchitectureGraphFlowNode));
  const edges: Edge[] = layout.edges.map((item) => ({ id: item.id, source: item.edge.sourceAssertionId, target: item.edge.targetAssertionId, label: item.edge.relationCode, animated: false, style: { stroke: "#64748b" }, labelStyle: { fontSize: 10, fill: "#334155" } }));
  const edgeById = new Map(layout.edges.map((item) => [item.id, item.edge]));
  const handleNodeClick: NodeMouseHandler = (_, node) => onNodeSelect(node.id);
  const handleEdgeClick: EdgeMouseHandler = (_, edge) => { const selected = edgeById.get(edge.id); if (selected) onEdgeSelect(selected); };
  return <section className="relative h-[clamp(32rem,calc(100dvh-16rem),48rem)] min-h-0 overflow-hidden rounded-lg border border-border bg-white" data-testid="architecture-graph-canvas"><div className="pointer-events-none absolute inset-0 z-0 grid grid-rows-3 opacity-60"><div className="border-b border-amber-200 bg-amber-50/45" /><div className="border-b border-blue-200 bg-blue-50/35" /><div className="bg-emerald-50/35" /></div><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView nodesDraggable={false} minZoom={0.2} maxZoom={1.8} onNodeClick={handleNodeClick} onEdgeClick={handleEdgeClick}><Background color="#cbd5e1" gap={24} size={1} /><Controls showInteractive={false} />{nodes.length > 30 ? <MiniMap pannable zoomable /> : null}</ReactFlow></section>;
}
