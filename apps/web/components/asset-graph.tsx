"use client";

import "@xyflow/react/dist/style.css";
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { AssetGraph, AssetGraphNode } from "@specforge/core";

const palette: Record<string, string> = {
  domain: "#2563eb",
  dataModel: "#059669",
  api: "#7c3aed",
  event: "#db2777",
  businessRule: "#d97706",
  stateMachine: "#0891b2",
  proposal: "#dc2626",
  adr: "#475569"
};

export function AssetGraphView({ graph }: { graph: AssetGraph }) {
  const [selected, setSelected] = useState<AssetGraphNode | null>(graph.nodes[0] ?? null);
  const graphNodeById = useMemo(() => new Map(graph.nodes.map((item) => [item.id, item])), [graph.nodes]);
  const nodes: Node[] = graph.nodes.map((item, index) => ({
    id: item.id,
    position: { x: (index % 4) * 260, y: Math.floor(index / 4) * 150 },
    data: { label: `${item.label}\n${item.type}` },
    style: {
      border: `1px solid ${palette[item.type] ?? "#64748b"}`,
      borderRadius: 8,
      color: "#18202f",
      fontSize: 12,
      padding: 10,
      width: 210,
      whiteSpace: "pre-line"
    }
  }));
  const edges: Edge[] = graph.edges.map((item) => ({ id: item.id, source: item.source, target: item.target, label: item.label, animated: false }));

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="h-[680px] rounded-lg border border-border bg-white">
        <ReactFlow
          edges={edges}
          fitView
          nodes={nodes}
          onNodeClick={(_, node) => setSelected(graphNodeById.get(node.id) ?? null)}
        >
          <MiniMap />
          <Controls />
          <Background />
        </ReactFlow>
      </div>
      <aside className="rounded-lg border border-border bg-white p-4 shadow-panel">
        <h2 className="text-base font-semibold">Node Details</h2>
        {selected ? (
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <div className="text-xs uppercase text-muted">Label</div>
              <div className="font-medium">{selected.label}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted">Type</div>
              <div>{selected.type}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted">Summary</div>
              <p className="mt-1 text-muted">{selected.summary}</p>
            </div>
            <Link className="inline-flex h-9 items-center rounded-md bg-accent px-3 text-sm font-medium text-white" href={assetHref(selected)}>
              Open detail
            </Link>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">Select a node to inspect it.</p>
        )}
      </aside>
    </div>
  );
}

function assetHref(node: AssetGraphNode): string {
  const routes: Record<string, string> = {
    domain: "domains",
    dataModel: "data-models",
    api: "apis",
    event: "events",
    businessRule: "rules",
    stateMachine: "state-machines",
    integration: "integrations",
    quality: "quality",
    observability: "observability",
    adr: "adrs"
  };
  if (node.type === "proposal") return `/proposals/${node.id}`;
  return `/assets/${routes[node.type] ?? "domains"}/${node.id}`;
}
