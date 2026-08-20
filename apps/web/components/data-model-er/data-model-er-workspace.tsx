"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DataModelGraphResponse } from "@specforge/core";
import { createErGraphState, deriveErLod, mergeErGraphResponses, selectErGraph, type ErGraphState } from "./er-graph-store";
import { layoutErGraphWithFallback } from "./er-layout";
import { ErPixiRenderer, type ErRendererFailure, type ErRendererStatus } from "./er-pixi-renderer";

export interface DataModelErWorkspaceProps {
  responses: DataModelGraphResponse[];
  locale?: "en" | "zh";
  title?: string;
}

export function buildSemanticRows(responses: DataModelGraphResponse[], locale: "en" | "zh" = "en"): Array<{ id: string; label: string; type: string; relationCount: number }> {
  const snapshot = mergeErGraphResponses(responses);
  const degree = new Map<string, number>();
  for (const edge of snapshot.edges) { degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1); degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1); }
  return snapshot.nodes.map((node) => ({ id: node.id, label: node.label || node.displayName, type: locale === "zh" ? (({ dataModel: "数据模型", dataEntity: "数据实体", dataField: "数据字段" } as Record<string, string>)[node.nodeType] ?? node.nodeType) : node.nodeType, relationCount: degree.get(node.id) ?? 0 }));
}

export function DataModelErWorkspace({ responses, locale = "en", title }: DataModelErWorkspaceProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ErPixiRenderer | undefined>(undefined);
  const snapshot = useMemo(() => mergeErGraphResponses(responses), [responses]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ErRendererStatus>({ ready: false, lod: deriveErLod(snapshot.nodes.length, snapshot.edges.length) });
  const [failure, setFailure] = useState<ErRendererFailure>();
  const state = useMemo<ErGraphState>(() => { const base = createErGraphState(snapshot); return { ...base, search, snapshot: selectErGraph({ ...base, search }) }; }, [snapshot, search]);
  const layout = useMemo(() => layoutErGraphWithFallback({ nodes: state.snapshot.nodes, edges: state.snapshot.edges }), [state.snapshot.nodes, state.snapshot.edges]);
  const rows = useMemo(() => { const base = responses[0]; return base ? buildSemanticRows([{ ...base, nodes: state.snapshot.nodes, edges: state.snapshot.edges }], locale) : []; }, [responses, state.snapshot.nodes, state.snapshot.edges, locale]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const renderer = new ErPixiRenderer({ locale, onStatus: (next) => { setStatus(next); setFailure(next.failure); } });
    rendererRef.current = renderer;
    void renderer.mount(canvasRef.current).then(() => renderer.setGraph(state, layout));
    return () => { renderer.destroy(); rendererRef.current = undefined; };
  }, [locale]);

  useEffect(() => { rendererRef.current?.setGraph(state, layout); }, [state, layout]);

  const semanticFallback = Boolean(failure) || !status.ready || layout.degraded || status.lod.lod === "SKELETON";
  return <section className="relative overflow-hidden rounded-lg border border-border bg-white" aria-label={title ?? (locale === "zh" ? "数据模型关系图" : "Data model relationship diagram")} data-testid="data-model-er-workspace">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div><h2 className="text-sm font-semibold text-ink">{title ?? (locale === "zh" ? "数据模型关系图" : "Data model ER workspace")}</h2><p className="mt-1 text-xs text-muted">{snapshot.nodes.length} nodes · {snapshot.edges.length} relations</p></div>
      <label className="flex items-center gap-2 text-xs text-muted"><span>{locale === "zh" ? "查找" : "Find"}</span><input className="rounded border border-border px-2 py-1 text-ink" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={locale === "zh" ? "实体或字段" : "Entity or field"} /></label>
    </header>
    <div ref={canvasRef} className="relative min-h-[32rem] bg-slate-50" data-testid="data-model-er-canvas" />
    {semanticFallback ? <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status"><strong>{locale === "zh" ? "已切换到语义列表" : "Semantic list fallback"}</strong><span className="ml-2">{failure ?? (layout.degraded ? "LAYOUT_DEGRADED" : "WEBGL_UNAVAILABLE")}</span></div> : null}
    <div className="max-h-72 overflow-auto border-t border-border" aria-label={locale === "zh" ? "数据模型节点列表" : "Data model node list"}>
      <table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-muted"><tr><th className="px-4 py-2">{locale === "zh" ? "名称" : "Name"}</th><th className="px-4 py-2">{locale === "zh" ? "类型" : "Type"}</th><th className="px-4 py-2">{locale === "zh" ? "关系" : "Relations"}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-border"><td className="px-4 py-2 font-medium text-ink">{row.label}</td><td className="px-4 py-2 text-muted">{row.type}</td><td className="px-4 py-2 text-muted">{row.relationCount}</td></tr>)}</tbody></table>
    </div>
  </section>;
}
