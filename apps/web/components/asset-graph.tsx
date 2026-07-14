"use client";

import "@xyflow/react/dist/style.css";
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { AssetGraph, AssetGraphNode } from "@specforge/core";
import { buildScopedGraphAssetHref } from "../lib/graph-links";
import { graphEdgeDisplayLabel } from "../lib/graph-labels";
import { useLanguage } from "./language-provider";

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

export function AssetGraphView({ graph, scope }: { graph: AssetGraph; scope: string }) {
  const { locale } = useLanguage();
  const copy = locale === "zh"
    ? { details: "节点详情", label: "名称", type: "类型", summary: "摘要", open: "打开详情", select: "选择节点查看详情。" }
    : { details: "Node Details", label: "Label", type: "Type", summary: "Summary", open: "Open detail", select: "Select a node to inspect it." };
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
  const edges: Edge[] = graph.edges.map((item) => {
    const localized = item as typeof item & { displayLabel?: string };
    return {
      id: item.id,
      source: item.source,
      target: item.target,
      label: localized.displayLabel ?? graphEdgeDisplayLabel(item.label, locale),
      animated: false
    };
  });

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
        <h2 className="text-base font-semibold">{copy.details}</h2>
        {selected ? (
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <div className="text-xs uppercase text-muted">{copy.label}</div>
              <div className="font-medium">{selected.label}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted">{copy.type}</div>
              <div>{selected.type}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted">{copy.summary}</div>
              <p className="mt-1 text-muted">{selected.summary}</p>
            </div>
            <Link className="inline-flex h-9 items-center rounded-md bg-accent px-3 text-sm font-medium text-white" href={buildScopedGraphAssetHref(selected, scope)}>
              {copy.open}
            </Link>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">{copy.select}</p>
        )}
      </aside>
    </div>
  );
}
