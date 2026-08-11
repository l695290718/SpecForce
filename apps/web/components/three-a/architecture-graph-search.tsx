"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { GraphSemanticNode } from "./architecture-graph-store";
import { T } from "../language-provider";

export function ArchitectureGraphSearch({ nodes, onSelect }: { nodes: readonly GraphSemanticNode[]; onSelect(id: string): void }) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return nodes.filter(({ attributes }) => `${attributes.label} ${attributes.assertionId ?? ""} ${attributes.kind}`.toLowerCase().includes(normalized)).slice(0, 8);
  }, [nodes, query]);
  return <div className="relative min-w-64 flex-1" data-testid="architecture-graph-search"><label className="sr-only" htmlFor="architecture-graph-search-input"><T k="threeA.searchGraph" /></label><Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2.5 text-muted" size={15} /><input id="architecture-graph-search-input" className="h-9 w-full rounded-md border border-border bg-white pl-8 pr-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-blue-100" placeholder="orders.api" value={query} onChange={(event) => setQuery(event.target.value)} />{matches.length ? <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-white p-1 shadow-panel">{matches.map(({ id, attributes }) => <li key={id}><button className="w-full rounded px-2 py-2 text-left text-sm text-ink hover:bg-chrome" onClick={() => { onSelect(id); setQuery(""); }} type="button"><span className="block font-semibold">{attributes.label}</span><span className="block text-[11px] text-muted">{attributes.kind} · {id}</span></button></li>)}</ul> : null}</div>;
}
