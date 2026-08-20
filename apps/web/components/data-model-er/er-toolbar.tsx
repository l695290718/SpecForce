"use client";

import { Layers3, List, Network, RotateCcw, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type ErView = "list" | "er";
export type ErToolbarMode = "MODEL" | "SCOPE";

export interface ErToolbarProps {
  locale: "en" | "zh";
  defaultView: ErView;
  defaultMode: ErToolbarMode;
  allowScopeMode: boolean;
  rootModelId?: string;
}

const nodeOptions = ["dataModel", "dataEntity", "dataField"] as const;
const relationshipOptions = ["CONTAINS", "REFERENCES"] as const;

export function ErToolbar({ locale, defaultView, defaultMode, allowScopeMode, rootModelId }: ErToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = (params.get("view") as ErView | null) ?? defaultView;
  const mode = (params.get("mode") as ErToolbarMode | null) ?? defaultMode;
  const search = params.get("search") ?? "";
  const selectedNodes = new Set(params.getAll("nodeTypes").flatMap((value) => value.split(",")).filter(Boolean));
  const selectedRelationships = new Set(params.getAll("relationshipCodes").flatMap((value) => value.split(",")).filter(Boolean));
  const labels = locale === "zh"
    ? { list: "列表", er: "ER 图", model: "当前模型", scope: "当前 Scope", search: "搜索模型、实体或字段", nodes: "节点类型", relations: "关系类型", reset: "重置" }
    : { list: "List", er: "ER Diagram", model: "Current model", scope: "Current Scope", search: "Search models, entities, or fields", nodes: "Node types", relations: "Relationships", reset: "Reset" };

  function update(updates: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === "") next.delete(key);
      else next.set(key, value);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  function toggleParam(key: "nodeTypes" | "relationshipCodes", value: string) {
    const current = key === "nodeTypes" ? selectedNodes : selectedRelationships;
    const next = new Set(current);
    if (next.has(value)) next.delete(value); else next.add(value);
    update({ [key]: [...next].sort().join(",") || undefined });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface/60 px-4 py-3" aria-label={locale === "zh" ? "数据模型关系图工具栏" : "Data model ER toolbar"}>
      <div className="inline-flex rounded-md border border-border bg-white p-1" role="group" aria-label={locale === "zh" ? "视图" : "View"}>
        <button className={view === "list" ? "inline-flex items-center gap-1 rounded bg-ink px-2 py-1 text-xs font-semibold text-white" : "inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted hover:bg-surface"} onClick={() => update({ view: "list" })} title={labels.list} type="button"><List size={14} aria-hidden="true" />{labels.list}</button>
        <button className={view === "er" ? "inline-flex items-center gap-1 rounded bg-ink px-2 py-1 text-xs font-semibold text-white" : "inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted hover:bg-surface"} onClick={() => update({ view: "er" })} title={labels.er} type="button"><Network size={14} aria-hidden="true" />{labels.er}</button>
      </div>
      {allowScopeMode ? <div className="inline-flex rounded-md border border-border bg-white p-1" role="group" aria-label={locale === "zh" ? "图范围" : "Graph scope"}>
        <button className={mode === "MODEL" ? "rounded bg-surface px-2 py-1 text-xs font-semibold text-ink" : "rounded px-2 py-1 text-xs text-muted hover:bg-surface"} onClick={() => update({ mode: "MODEL", rootModelId })} title={labels.model} type="button"><Layers3 size={14} className="mr-1 inline" aria-hidden="true" />{labels.model}</button>
        <button className={mode === "SCOPE" ? "rounded bg-surface px-2 py-1 text-xs font-semibold text-ink" : "rounded px-2 py-1 text-xs text-muted hover:bg-surface"} onClick={() => update({ mode: "SCOPE", rootModelId: undefined })} title={labels.scope} type="button">{labels.scope}</button>
      </div> : null}
      <label className="ml-auto inline-flex min-w-[14rem] flex-1 items-center gap-2 rounded-md border border-border bg-white px-2 py-1.5 text-xs text-muted md:max-w-xs">
        <Search size={14} aria-hidden="true" />
        <span className="sr-only">{labels.search}</span>
        <input className="min-w-0 flex-1 bg-transparent text-ink outline-none" defaultValue={search} key={search} onChange={(event) => update({ search: event.target.value || undefined })} placeholder={labels.search} />
      </label>
      <details className="relative">
        <summary className="cursor-pointer list-none rounded-md border border-border bg-white px-2 py-1.5 text-xs text-muted" title={labels.nodes}>{labels.nodes}</summary>
        <div className="absolute right-0 z-20 mt-2 w-44 rounded-md border border-border bg-white p-2 shadow-lg">
          {nodeOptions.map((value) => <label className="flex items-center gap-2 px-2 py-1 text-xs text-ink" key={value}><input checked={selectedNodes.has(value)} onChange={() => toggleParam("nodeTypes", value)} type="checkbox" />{value}</label>)}
        </div>
      </details>
      <details className="relative">
        <summary className="cursor-pointer list-none rounded-md border border-border bg-white px-2 py-1.5 text-xs text-muted" title={labels.relations}>{labels.relations}</summary>
        <div className="absolute right-0 z-20 mt-2 w-44 rounded-md border border-border bg-white p-2 shadow-lg">
          {relationshipOptions.map((value) => <label className="flex items-center gap-2 px-2 py-1 text-xs text-ink" key={value}><input checked={selectedRelationships.has(value)} onChange={() => toggleParam("relationshipCodes", value)} type="checkbox" />{value}</label>)}
        </div>
      </details>
      <button className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1.5 text-xs text-muted hover:bg-surface" onClick={() => router.replace(pathname, { scroll: false })} title={labels.reset} type="button"><RotateCcw size={14} aria-hidden="true" />{labels.reset}</button>
    </div>
  );
}
