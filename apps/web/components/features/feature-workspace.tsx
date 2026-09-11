import Link from "next/link";
import React from "react";
import { Network, PanelsTopLeft, Search } from "lucide-react";
import type { FeatureDetail, FeatureGraphResponse, FeatureListPage } from "../../lib/features";
import { withSearchParams } from "../../lib/locale";
import { FeatureDetail as FeatureDetailPanel } from "./feature-detail";
import { FeatureGraph } from "./feature-graph";
import { FeatureList } from "./feature-list";

export type FeatureWorkspaceView = "service" | "functional" | "graph";
export function FeatureWorkspace({ initialView, scope, locale, query = "", initialData, selected, graph }: { initialView: FeatureWorkspaceView; scope: string; locale: "zh" | "en"; query?: string; initialData: FeatureListPage; selected?: FeatureDetail; graph?: FeatureGraphResponse }) {
  const labels = locale === "zh" ? { service: "服务特性", functional: "功能特性", graph: "关系图谱", search: "搜索名称、描述或标签", count: "当前页", managed: "只读视图，内容通过 MCP 管理" } : { service: "Service Features", functional: "Functional Features", graph: "Relationship Graph", search: "Search name, description, or tag", count: "This page", managed: "Read-only view. Content is managed through MCP." };
  return <div className="space-y-4">
    <div className="flex flex-col gap-3 border-b border-border pb-3 md:flex-row md:items-center md:justify-between"><nav className="flex gap-1" aria-label={locale === "zh" ? "特性视图" : "Feature views"}>{(["service", "functional", "graph"] as const).map((view) => <Link className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium ${initialView === view ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`} href={withSearchParams("/features", { scope, locale, view })} key={view}>{view === "graph" ? <Network size={15} /> : <PanelsTopLeft size={15} />}{labels[view]}</Link>)}</nav><span className="text-xs text-muted">{labels.managed}</span></div>
    {initialView !== "graph" ? <><form className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center"><input name="scope" type="hidden" value={scope} /><input name="locale" type="hidden" value={locale} /><input name="view" type="hidden" value={initialView} /><label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-2.5 text-slate-400" size={16} /><input className="h-9 w-full rounded-md border border-border bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" defaultValue={query} name="q" placeholder={labels.search} /></label><span className="text-sm text-muted">{labels.count}: {initialData.items.length}</span></form><div className={`grid gap-5 ${selected ? "xl:grid-cols-[minmax(0,1fr)_360px]" : ""}`}><FeatureList items={initialData.items} locale={locale} query={query} scope={scope} view={initialView} />{selected ? <FeatureDetailPanel feature={selected} locale={locale} /> : null}</div>{initialData.hasMore && initialData.nextCursor ? <div className="flex justify-end"><Link className="rounded-md border border-border bg-white px-3 py-2 text-sm font-medium hover:border-blue-300" href={withSearchParams("/features", { scope, locale, view: initialView, q: query, cursor: initialData.nextCursor })}>{locale === "zh" ? "下一页" : "Next page"}</Link></div> : null}</> : graph ? <FeatureGraph locale={locale} response={graph} scope={scope} /> : null}
  </div>;
}
