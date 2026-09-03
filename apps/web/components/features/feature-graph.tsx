"use client";

import { Focus, Minus, Plus, Route, RotateCcw } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type Sigma from "sigma";
import type { FeatureGraphResponse } from "../../lib/features";
import { buildFeatureGraphModel, highlightImpactPath, type FeatureGraphEdgeAttributes, type FeatureGraphNodeAttributes } from "./feature-graph-model";

type FeatureSigma = Sigma<FeatureGraphNodeAttributes, FeatureGraphEdgeAttributes>;

export function FeatureGraph({ response, locale }: { response: FeatureGraphResponse; locale: "zh" | "en" }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<FeatureSigma | undefined>(undefined);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [pathTarget, setPathTarget] = useState<string | undefined>(undefined);
  const allTypes = useMemo(() => [...new Set(response.nodes.map((node) => node.nodeType))], [response.nodes]);
  const [visibleTypes, setVisibleTypes] = useState(() => new Set(allTypes));
  const graph = useMemo(() => buildFeatureGraphModel(response, { visibleTypes }), [response, visibleTypes]);
  const copy = locale === "zh" ? { empty: "当前 Scope 尚无特性关系。", partial: "图已按预算截断，可选择根节点继续展开。", filter: "节点类型", reset: "复位视图", path: "高亮路径", details: "节点详情" } : { empty: "No Feature relationships exist in this Scope.", partial: "The graph is budget-truncated. Select a root to expand.", filter: "Node types", reset: "Reset view", path: "Highlight path", details: "Node details" };

  useEffect(() => {
    if (!containerRef.current || graph.order === 0) return;
    let disposed = false;
    let dragged: string | null = null;
    void import("sigma").then(({ default: SigmaConstructor }) => {
      if (disposed || !containerRef.current) return;
      const sigma = new SigmaConstructor(graph, containerRef.current, { renderEdgeLabels: true, labelDensity: 0.12, labelGridCellSize: 90, defaultNodeType: "circle", zIndex: true });
      sigmaRef.current = sigma;
      sigma.on("clickNode", ({ node }) => setSelected(node));
      sigma.on("doubleClickNode", ({ node, event }) => { event.preventSigmaDefault(); setPathTarget(node); });
      sigma.on("downNode", ({ node, event }) => { dragged = node; event.preventSigmaDefault(); });
      sigma.getMouseCaptor().on("mousemovebody", (event) => { if (!dragged) return; const position = sigma.viewportToGraph(event); graph.mergeNodeAttributes(dragged, position); event.preventSigmaDefault(); event.original.preventDefault(); });
      sigma.getMouseCaptor().on("mouseup", () => { dragged = null; });
    });
    return () => { disposed = true; sigmaRef.current?.kill(); sigmaRef.current = undefined; };
  }, [graph]);

  useEffect(() => {
    graph.forEachEdge((edge) => graph.mergeEdgeAttributes(edge, { color: graph.getEdgeAttribute(edge, "relationType") === "CONTRIBUTES_TO" ? "#6366f1" : "#94a3b8", size: graph.getEdgeAttribute(edge, "relationType") === "CONTRIBUTES_TO" ? 2.2 : 1 }));
    if (selected && pathTarget) for (const edge of highlightImpactPath(graph, selected, pathTarget)) graph.mergeEdgeAttributes(edge, { color: "#ef4444", size: 4 });
    sigmaRef.current?.refresh();
  }, [graph, selected, pathTarget]);

  if (response.nodes.length === 0) return <div className="grid h-[560px] place-items-center border border-dashed border-border bg-white text-sm text-muted">{copy.empty}</div>;
  const selectedNode = selected ? response.nodes.find((node) => node.id === selected) : undefined;
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
    <section className="relative h-[640px] overflow-hidden border border-border bg-[#f8fafc] shadow-panel">
      <div className="absolute left-3 top-3 z-10 flex gap-1 rounded-md border border-border bg-white/95 p-1 shadow-panel">
        <IconButton label={locale === "zh" ? "放大" : "Zoom in"} onClick={() => void sigmaRef.current?.getCamera().animatedZoom()}><Plus size={16} /></IconButton>
        <IconButton label={locale === "zh" ? "缩小" : "Zoom out"} onClick={() => void sigmaRef.current?.getCamera().animatedUnzoom()}><Minus size={16} /></IconButton>
        <IconButton label={copy.reset} onClick={() => void sigmaRef.current?.getCamera().animatedReset()}><RotateCcw size={16} /></IconButton>
        <IconButton label={copy.path} onClick={() => { setPathTarget(undefined); sigmaRef.current?.refresh(); }}><Route size={16} /></IconButton>
        <IconButton label={locale === "zh" ? "聚焦选中节点" : "Focus selected node"} onClick={() => { if (!selected) return; const { x, y } = graph.getNodeAttributes(selected); sigmaRef.current?.getCamera().animate({ x, y, ratio: 0.35 }); }}><Focus size={16} /></IconButton>
      </div>
      <div className="h-full w-full" ref={containerRef} />
      {response.partial ? <div className="absolute bottom-3 left-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">{copy.partial}</div> : null}
    </section>
    <aside className="space-y-5 border-l border-border pl-4">
      <div><h2 className="text-sm font-semibold">{copy.filter}</h2><div className="mt-2 space-y-2">{allTypes.map((type) => <label className="flex items-center gap-2 text-sm" key={type}><input checked={visibleTypes.has(type)} onChange={() => setVisibleTypes((current) => { const next = new Set(current); if (next.has(type)) next.delete(type); else next.add(type); return next; })} type="checkbox" />{type}</label>)}</div></div>
      <div><h2 className="text-sm font-semibold">{copy.details}</h2>{selectedNode ? <div className="mt-2 space-y-2 text-sm"><div className="font-semibold text-ink">{selectedNode.label}</div><div className="font-mono text-xs text-muted break-all">{selectedNode.logicalId}</div><div className="text-muted">{selectedNode.nodeType}</div><p className="leading-relaxed text-slate-600">{selectedNode.summary}</p><div className="text-xs text-muted">{locale === "zh" ? "双击另一个节点以高亮最短影响路径。" : "Double-click another node to highlight the shortest impact path."}</div></div> : <p className="mt-2 text-sm text-muted">{locale === "zh" ? "选择节点查看信息。" : "Select a node to inspect it."}</p>}</div>
    </aside>
  </div>;
}

function IconButton({ label, onClick, children }: { label: string; onClick(): void; children: React.ReactNode }) { return <button aria-label={label} className="grid h-8 w-8 place-items-center rounded text-slate-600 hover:bg-slate-100 hover:text-slate-950" onClick={onClick} title={label} type="button">{children}</button>; }
