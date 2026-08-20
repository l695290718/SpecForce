"use client";

import { Maximize2, Minus, Plus, RefreshCw, RotateCcw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DataModelGraphResponse } from "@specforge/core";
import { translate, type Locale } from "../../lib/i18n";
import { createErGraphState, deriveErLod, mergeErGraphResponses, selectErGraph, type ErGraphSnapshot, type ErGraphState } from "./er-graph-store";
import { projectErDiagram, type ErDiagramProjection } from "./er-diagram-projection";
import { layoutErDiagramWithFallback, type ErLayoutResult } from "./er-layout";
import { ErPixiRenderer, type ErRendererFailure, type ErRendererStatus } from "./er-pixi-renderer";
import { DEFAULT_ER_CAMERA, type ErCamera } from "./er-interaction";
import { ErInspector } from "./er-inspector";

export interface DataModelErWorkspaceProps {
  responses: DataModelGraphResponse[];
  locale?: Locale;
  title?: string;
}

export interface ErSemanticRow {
  id: string;
  label: string;
  type: string;
  relationCount: number;
}

export interface ErFieldCatalogRow {
  id: string;
  entity: string;
  field: string;
  type: string;
  markers: string;
}

export type ErWorkspaceStatusCode = "EMPTY" | "SCOPE_UNAVAILABLE" | "PARTIAL" | "READY";

export function buildSemanticRows(responses: DataModelGraphResponse[], locale: Locale = "en"): ErSemanticRow[] {
  if (!responses.length) return [];
  const snapshot = mergeErGraphResponses(responses);
  const degree = new Map<string, number>();
  for (const edge of snapshot.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  const typeLabels: Record<string, string> = locale === "zh"
    ? { dataModel: "数据模型", dataEntity: "数据实体", dataField: "数据字段" }
    : { dataModel: "Data model", dataEntity: "Data entity", dataField: "Data field" };
  return snapshot.nodes.map((node) => ({
    id: node.id,
    label: node.displayName || node.logicalId,
    type: typeLabels[node.nodeType] ?? node.nodeType,
    relationCount: degree.get(node.id) ?? 0
  }));
}

export function buildFieldCatalogRows(projection: ErDiagramProjection | undefined): ErFieldCatalogRow[] {
  if (!projection) return [];
  return projection.entities.flatMap((entity) => entity.fields.map((field) => ({
    id: field.id,
    entity: entity.displayName,
    field: field.displayName,
    type: field.dataType,
    markers: [field.primaryKey ? "PK" : "", field.foreignKey ? "FK" : "", field.unique ? "UQ" : ""].filter(Boolean).join(" ") || "-"
  })));
}

export function getErWorkspaceStatus(responses: DataModelGraphResponse[], projection?: ErDiagramProjection): ErWorkspaceStatusCode {
  if (!responses.length) return "SCOPE_UNAVAILABLE";
  if (responses.some((response) => response.errors.some((error) => error.code === "SCOPE_UNAVAILABLE"))) return "SCOPE_UNAVAILABLE";
  if (!projection?.entities.length) return "EMPTY";
  if (responses.some((response) => response.partial || response.hasMore)) return "PARTIAL";
  return "READY";
}

export function DataModelErWorkspace({ responses, locale = "en", title }: DataModelErWorkspaceProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ErPixiRenderer | undefined>(undefined);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const snapshot = useMemo<ErGraphSnapshot | undefined>(() => responses.length ? mergeErGraphResponses(responses) : undefined, [responses]);
  const [search, setSearch] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [status, setStatus] = useState<ErRendererStatus>({ ready: false, lod: deriveErLod(snapshot?.nodes.length ?? 0, snapshot?.edges.length ?? 0) });
  const [camera, setCamera] = useState<ErCamera>(DEFAULT_ER_CAMERA);
  const [failure, setFailure] = useState<ErRendererFailure>();
  const state = useMemo<ErGraphState | undefined>(() => {
    if (!snapshot) return undefined;
    const base = createErGraphState(snapshot);
    return { ...base, search, selectedId: params.get("selection") ?? undefined, snapshot: selectErGraph({ ...base, search }) };
  }, [params, search, snapshot]);
  const projection = useMemo(() => state ? projectErDiagram(state.snapshot) : undefined, [state]);
  const layout = useMemo<ErLayoutResult | undefined>(() => projection ? layoutErDiagramWithFallback({ entities: projection.entities, relations: projection.relations }) : undefined, [projection]);
  const rows = useMemo(() => buildSemanticRows(responses, locale), [locale, responses]);
  const fieldRows = useMemo(() => buildFieldCatalogRows(projection), [projection]);
  const dataStatus = getErWorkspaceStatus(responses, projection);
  const copy = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  useEffect(() => {
    if (!canvasRef.current || !state || !projection || !layout || dataStatus === "SCOPE_UNAVAILABLE" || dataStatus === "EMPTY") return;
    const renderer = new ErPixiRenderer({
      locale,
      onStatus: (next) => { setStatus(next); setFailure(next.failure); },
      onEntitySelect: selectFromRenderer,
      onFieldSelect: selectFromRenderer,
      onRelationSelect: selectFromRenderer,
      onCameraChange: setCamera,
    });
    rendererRef.current = renderer;
    let active = true;
    void renderer.mount(canvasRef.current).then(() => {
      if (active) renderer.setGraph(state, layout, projection);
    });
    return () => { active = false; renderer.destroy(); rendererRef.current = undefined; };
  }, [dataStatus, layout, locale, projection, retryKey, state]);

  useEffect(() => {
    if (rendererRef.current && state && projection && layout && dataStatus !== "SCOPE_UNAVAILABLE" && dataStatus !== "EMPTY") rendererRef.current.setGraph(state, layout, projection);
  }, [dataStatus, layout, projection, state]);

  function selectFromRenderer(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set("selection", id);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  function retryRenderer() {
    setFailure(undefined);
    setStatus({ ready: false, lod: deriveErLod(snapshot?.nodes.length ?? 0, snapshot?.edges.length ?? 0) });
    setRetryKey((value) => value + 1);
  }

  const fallbackReason = failure === "WEBGL_UNAVAILABLE"
    ? copy("er.webglUnavailable")
    : failure === "WEBGL_CONTEXT_LOST"
      ? copy("er.webglContextLost")
      : failure === "CLIENT_CAPACITY_EXCEEDED"
        ? copy("er.capacityExceeded")
        : failure === "LAYOUT_DEGRADED" || layout?.degraded
          ? copy("er.layoutDegraded")
          : dataStatus === "SCOPE_UNAVAILABLE"
            ? copy("er.scopeUnavailable")
            : dataStatus === "EMPTY"
              ? copy("er.empty")
              : dataStatus === "PARTIAL"
                ? copy("er.partial")
                : undefined;
  const semanticFallback = Boolean(fallbackReason) || !status.ready || status.lod.lod === "SKELETON";
  const showControls = Boolean(rendererRef.current && projection?.entities.length);

  return <section className="relative overflow-hidden rounded-lg border border-border bg-white" aria-label={title ?? copy("er.workspace")} data-testid="data-model-er-workspace">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div><h2 className="text-sm font-semibold text-ink">{title ?? copy("er.workspace")}</h2><p className="mt-1 text-xs text-muted">{snapshot?.nodes.length ?? 0} {copy("er.nodes")} · {snapshot?.edges.length ?? 0} {copy("er.relations")}</p></div>
      <label className="flex items-center gap-2 text-xs text-muted"><span>{copy("er.find")}</span><input aria-label={copy("er.find")} className="rounded border border-border px-2 py-1 text-ink" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy("er.findPlaceholder")} /></label>
    </header>
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface/40 px-4 py-2" aria-label={copy("er.controls")}>
      <button aria-label={copy("er.zoomOut")} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-white text-muted disabled:cursor-not-allowed disabled:opacity-50" disabled={!showControls} onClick={() => rendererRef.current?.zoomOut()} title={copy("er.zoomOut")} type="button"><Minus size={14} aria-hidden="true" /></button>
      <span className="min-w-12 text-center font-mono text-xs text-muted" aria-live="polite">{Math.round(camera.scale * 100)}%</span>
      <button aria-label={copy("er.zoomIn")} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-white text-muted disabled:cursor-not-allowed disabled:opacity-50" disabled={!showControls} onClick={() => rendererRef.current?.zoomIn()} title={copy("er.zoomIn")} type="button"><Plus size={14} aria-hidden="true" /></button>
      <button className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1.5 text-xs text-muted disabled:cursor-not-allowed disabled:opacity-50" disabled={!showControls} onClick={() => rendererRef.current?.fitToView()} title={copy("er.fit")} type="button"><Maximize2 size={14} aria-hidden="true" />{copy("er.fit")}</button>
      <button className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1.5 text-xs text-muted disabled:cursor-not-allowed disabled:opacity-50" disabled={!showControls} onClick={() => rendererRef.current?.resetCamera()} title={copy("er.resetCamera")} type="button"><RotateCcw size={14} aria-hidden="true" />{copy("er.resetCamera")}</button>
      <button className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1.5 text-xs text-muted disabled:cursor-not-allowed disabled:opacity-50" disabled={!showControls} onClick={() => rendererRef.current?.resetLayout()} title={copy("er.resetLayout")} type="button"><RotateCcw size={14} aria-hidden="true" />{copy("er.resetLayout")}</button>
      <button className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1.5 text-xs text-muted" onClick={retryRenderer} title={copy("er.retry")} type="button"><RefreshCw size={14} aria-hidden="true" />{copy("er.retry")}</button>
      <span className="text-[11px] text-muted">{copy("er.readOnly")}</span>
    </div>
    <div ref={canvasRef} className="relative min-h-[32rem] touch-none select-none bg-slate-50" data-testid="data-model-er-canvas">
      {fallbackReason ? <div className="absolute inset-x-4 top-4 z-10 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status"><strong>{semanticFallback ? copy("er.semanticFallback") : copy("er.status")}</strong><span className="ml-2">{fallbackReason}</span></div> : null}
    </div>
    {semanticFallback ? <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status"><strong>{copy("er.semanticFallback")}</strong><span className="ml-2">{fallbackReason ?? copy("er.loading")}</span></div> : null}
    <div className="max-h-72 overflow-auto border-t border-border" aria-label={copy("er.semanticList")}>
      <table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-muted"><tr><th className="px-4 py-2">{copy("er.name")}</th><th className="px-4 py-2">{copy("er.type")}</th><th className="px-4 py-2">{copy("er.relations")}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-border"><td className="px-4 py-2 font-medium text-ink">{row.label}</td><td className="px-4 py-2 text-muted">{row.type}</td><td className="px-4 py-2 text-muted">{row.relationCount}</td></tr>)}</tbody></table>
    </div>
    <div className="border-t border-border" aria-label={copy("er.fieldCatalog")}>
      <div className="px-4 py-3 text-xs font-semibold text-ink">{copy("er.fieldCatalog")}</div>
      {fieldRows.length ? <div className="max-h-64 overflow-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-muted"><tr><th className="px-4 py-2">{copy("er.entity")}</th><th className="px-4 py-2">{copy("er.field")}</th><th className="px-4 py-2">{copy("er.type")}</th><th className="px-4 py-2">{copy("er.markers")}</th></tr></thead><tbody>{fieldRows.map((row) => <tr key={row.id} className="border-t border-border"><td className="px-4 py-2 text-muted">{row.entity}</td><td className="px-4 py-2 font-medium text-ink">{row.field}</td><td className="px-4 py-2 text-muted">{row.type}</td><td className="px-4 py-2 font-mono text-[10px] text-muted">{row.markers}</td></tr>)}</tbody></table></div> : <p className="px-4 pb-4 text-xs text-muted">{copy("er.empty")}</p>}
    </div>
    <ErInspector response={responses[0]} locale={locale} />
  </section>;
}
