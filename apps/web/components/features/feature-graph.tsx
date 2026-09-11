"use client";

import { Focus, Layers3, Minus, Plus, Route, RotateCcw } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type Sigma from "sigma";
import type { FeatureGraphResponse } from "../../lib/features";
import { buildFeatureGraphModel, featureGraphColors, highlightImpactPath, type FeatureGraphEdgeAttributes, type FeatureGraphNodeAttributes } from "./feature-graph-model";

type FeatureSigma = Sigma<FeatureGraphNodeAttributes, FeatureGraphEdgeAttributes>;

const nodeTypeLabels: Record<string, { zh: string; en: string }> = {
  serviceFeature: { zh: "服务特性", en: "Service feature" }, functionalFeature: { zh: "功能特性", en: "Functional feature" }, api: { zh: "API", en: "API" }, apiOperation: { zh: "API 操作", en: "API operation" }, dataModel: { zh: "数据模型", en: "Data model" }, dataEntity: { zh: "数据实体", en: "Data entity" }, dataField: { zh: "数据字段", en: "Data field" }, event: { zh: "事件", en: "Event" }, businessRule: { zh: "业务规则", en: "Business rule" }, stateMachine: { zh: "状态机", en: "State machine" }, quality: { zh: "质量需求", en: "Quality requirement" }, observability: { zh: "可观测性", en: "Observability" }, adr: { zh: "架构决策", en: "ADR" }, proposal: { zh: "变更提案", en: "Proposal" }, evidence: { zh: "验证证据", en: "Evidence" }, domain: { zh: "领域", en: "Domain" },
};
const typeOrder = ["serviceFeature", "functionalFeature", "api", "apiOperation", "dataModel", "dataEntity", "dataField", "event", "businessRule", "stateMachine", "quality", "observability", "adr", "proposal", "evidence", "domain"];
function typeLabel(type: string, locale: "zh" | "en") { return nodeTypeLabels[type]?.[locale] ?? type; }
function withGraphSearchParams(path: string, searchParams: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) if (value !== undefined) params.set(key, value);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function FeatureGraph({ response, locale, scope }: { response: FeatureGraphResponse; locale: "zh" | "en"; scope: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<FeatureSigma | undefined>(undefined);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [pathTarget, setPathTarget] = useState<string | undefined>(undefined);
  const allTypes = useMemo(() => [...new Set(response.nodes.map((node) => node.nodeType))].sort((a, b) => (typeOrder.indexOf(a) - typeOrder.indexOf(b)) || a.localeCompare(b)), [response.nodes]);
  const [visibleTypes, setVisibleTypes] = useState(() => new Set(allTypes));
  useEffect(() => setVisibleTypes(new Set(allTypes)), [allTypes]);
  const graph = useMemo(() => buildFeatureGraphModel(response, { visibleTypes }), [response, visibleTypes]);
  const copy = locale === "zh" ? { empty: "当前 Scope 尚无特性关系。", partial: "图已按预算截断，可切换到全量关系或选择根节点继续展开。", filter: "显示类型", reset: "复位视图", path: "高亮路径", details: "节点详情", featureMode: "特性主视图", allMode: "全量关系", featureHint: "服务特性 → 功能特性 → 直接支撑资产", allHint: "包含 ADR、Proposal、Evidence 等治理节点", legend: "语义图例", relationSummary: "直接关系", techId: "技术标识", noSummary: "暂无摘要", pathHint: "双击另一个节点以高亮最短影响路径。" } : { empty: "No Feature relationships exist in this Scope.", partial: "The graph is budget-truncated. Switch to the full graph or select a root to expand.", filter: "Visible types", reset: "Reset view", path: "Highlight path", details: "Node details", featureMode: "Feature map", allMode: "Full graph", featureHint: "Service feature → functional feature → direct support assets", allHint: "Includes governance nodes such as ADRs, Proposals, and Evidence", legend: "Semantic legend", relationSummary: "Direct relationships", techId: "Technical ID", noSummary: "No summary available", pathHint: "Double-click another node to highlight the shortest impact path." };

  useEffect(() => {
    if (!containerRef.current || graph.order === 0) return;
    let disposed = false;
    let dragged: string | null = null;
    void import("sigma").then(({ default: SigmaConstructor }) => {
      if (disposed || !containerRef.current) return;
      const sigma = new SigmaConstructor(graph, containerRef.current, { renderEdgeLabels: false, labelDensity: 0.08, labelGridCellSize: 120, defaultNodeType: "circle", zIndex: true });
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
  const nodeById = new Map(response.nodes.map((node) => [node.id, node]));
  const selectedRelations = selectedNode ? response.edges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id).slice(0, 10) : [];
  const modeLink = (mode: "feature" | "all") => withGraphSearchParams("/features", { scope, locale, view: "graph", graphMode: mode });
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
    <section className="relative min-h-[700px] overflow-hidden border border-border bg-[#f8fafc] shadow-panel">
      <div className="absolute left-3 right-3 top-3 z-10 flex flex-col gap-3 rounded-lg border border-border bg-white/95 p-3 shadow-panel backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2"><Layers3 className="shrink-0 text-blue-600" size={17} /><div className="min-w-0"><div className="truncate text-sm font-semibold text-ink">{response.mode === "feature" ? copy.featureMode : copy.allMode}</div><div className="truncate text-xs text-muted">{response.mode === "feature" ? copy.featureHint : copy.allHint}</div></div></div>
        <div className="flex shrink-0 gap-1 rounded-md bg-slate-100 p-1 text-xs"><a className={`rounded px-2.5 py-1.5 font-medium ${response.mode === "feature" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"}`} href={modeLink("feature")}>{copy.featureMode}</a><a className={`rounded px-2.5 py-1.5 font-medium ${response.mode === "all" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"}`} href={modeLink("all")}>{copy.allMode}</a></div>
      </div>
      <div className="absolute left-3 top-[76px] z-10 flex gap-1 rounded-md border border-border bg-white/95 p-1 shadow-panel">
        <IconButton label={locale === "zh" ? "放大" : "Zoom in"} onClick={() => void sigmaRef.current?.getCamera().animatedZoom()}><Plus size={16} /></IconButton><IconButton label={locale === "zh" ? "缩小" : "Zoom out"} onClick={() => void sigmaRef.current?.getCamera().animatedUnzoom()}><Minus size={16} /></IconButton><IconButton label={copy.reset} onClick={() => void sigmaRef.current?.getCamera().animatedReset()}><RotateCcw size={16} /></IconButton><IconButton label={copy.path} onClick={() => { setPathTarget(undefined); sigmaRef.current?.refresh(); }}><Route size={16} /></IconButton><IconButton label={locale === "zh" ? "聚焦选中节点" : "Focus selected node"} onClick={() => { if (!selected) return; const { x, y } = graph.getNodeAttributes(selected); sigmaRef.current?.getCamera().animate({ x, y, ratio: 0.35 }); }}><Focus size={16} /></IconButton>
      </div>
      <div className="h-[700px] w-full" ref={containerRef} />
      {response.partial ? <div className="absolute bottom-3 left-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">{copy.partial}</div> : null}
    </section>
    <aside className="space-y-5 border-l border-border pl-4">
      <div><h2 className="text-sm font-semibold">{copy.filter}</h2><div className="mt-2 space-y-2">{allTypes.map((type) => <label className="flex items-center gap-2 text-sm" key={type}><input checked={visibleTypes.has(type)} onChange={() => setVisibleTypes((current) => { const next = new Set(current); if (next.has(type)) next.delete(type); else next.add(type); return next; })} type="checkbox" /><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: featureGraphColors[type] ?? "#64748b" }} />{typeLabel(type, locale)}</label>)}</div></div>
      <div><h2 className="text-sm font-semibold">{copy.legend}</h2><div className="mt-2 space-y-1.5 text-xs text-muted"><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" />{locale === "zh" ? "左列：价值能力" : "Left: value capabilities"}</div><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-violet-600" />{locale === "zh" ? "中列：可交付功能" : "Center: deliverable functions"}</div><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />{locale === "zh" ? "右列：支撑设计资产" : "Right: supporting design assets"}</div></div></div>
      <div><h2 className="text-sm font-semibold">{copy.details}</h2>{selectedNode ? <div className="mt-2 space-y-2 text-sm"><div className="font-semibold text-ink">{selectedNode.label}</div><div className="text-xs font-medium text-blue-700">{typeLabel(selectedNode.nodeType, locale)}</div><div className="break-all font-mono text-[11px] text-muted">{copy.techId}: {selectedNode.logicalId}</div><p className="leading-relaxed text-slate-600">{selectedNode.summary || copy.noSummary}</p><div className="border-t border-border pt-2"><div className="mb-1 text-xs font-semibold text-slate-700">{copy.relationSummary}</div>{selectedRelations.length ? <div className="space-y-1.5">{selectedRelations.map((edge) => { const otherId = edge.source === selectedNode.id ? edge.target : edge.source; const other = nodeById.get(otherId); return <div className="flex items-start gap-2 text-xs" key={edge.id}><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" /><span><span className="font-medium text-slate-600">{edge.relationType}</span><span className="text-muted"> · {other?.label ?? otherId}</span></span></div>; })}</div> : <div className="text-xs text-muted">{locale === "zh" ? "暂无直接关系。" : "No direct relationships."}</div>}</div><div className="text-xs text-muted">{copy.pathHint}</div></div> : <p className="mt-2 text-sm text-muted">{locale === "zh" ? "选择节点查看信息。" : "Select a node to inspect it."}</p>}</div>
    </aside>
  </div>;
}

function IconButton({ label, onClick, children }: { label: string; onClick(): void; children: React.ReactNode }) { return <button aria-label={label} className="grid h-8 w-8 place-items-center rounded text-slate-600 hover:bg-slate-100 hover:text-slate-950" onClick={onClick} title={label} type="button">{children}</button>; }
