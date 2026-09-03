import Link from "next/link";
import React from "react";
import type { FeatureListItem } from "../../lib/features";
import { withSearchParams } from "../../lib/locale";
import { FeatureStatus } from "./feature-status";

export function FeatureList({ items, scope, locale, view, query }: { items: FeatureListItem[]; scope: string; locale: "zh" | "en"; view: "service" | "functional"; query: string }) {
  if (items.length === 0) return <div className="border border-dashed border-border bg-white px-6 py-14 text-center text-sm text-muted">{locale === "zh" ? "当前 Scope 尚无匹配特性。特性只能通过 MCP 写入。" : "No matching Features exist in this Scope. Features are authored through MCP only."}</div>;
  return <div className="grid gap-3">{items.map((feature) => <article className="rounded-lg border border-border bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-panel" key={feature.id}>
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><Link className="text-base font-semibold text-ink hover:text-accent" href={withSearchParams("/features", { scope, locale, view, q: query, selection: feature.id })}>{feature.name}</Link><div className="mt-1 truncate font-mono text-xs text-muted" title={feature.id}>{feature.id}</div><p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-relaxed text-slate-600">{feature.summary}</p></div><FeatureStatus governance={feature.governance} lifecycle={feature.lifecycleStatus} locale={locale} /></div>
  </article>)}</div>;
}
