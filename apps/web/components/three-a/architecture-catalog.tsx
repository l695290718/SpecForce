"use client";

import React from "react";
import { Boxes, Braces, Cpu, Search } from "lucide-react";
import { useEffect, useMemo, useReducer, useRef } from "react";
import type { SearchArchitectureFactsResult } from "@specforge/knowledge-query";
import { T } from "../language-provider";
import type { ArchitectureLayer } from "../../lib/3a/workspace-loader";
import { runThreeAWebQuery } from "../../lib/3a/query-client";
import { catalogReducer, catalogRequestKey, initialCatalogState, type ThreeAQueryIdentity } from "./catalog-state";
import { ArchitectureLane } from "./architecture-lane";

const layers = [
  { layer: "BIZ" as const, Icon: Boxes, tone: "border-amber-200 bg-amber-50/45" },
  { layer: "SYS" as const, Icon: Braces, tone: "border-blue-200 bg-blue-50/45" },
  { layer: "TECH" as const, Icon: Cpu, tone: "border-emerald-200 bg-emerald-50/45" }
] as const;

export function ArchitectureCatalog({ initialCatalog, identity, onFocus }: { initialCatalog: Partial<Record<ArchitectureLayer, SearchArchitectureFactsResult>>; identity: ThreeAQueryIdentity; onFocus: (assertionId: string) => void }) {
  const [state, dispatch] = useReducer(catalogReducer, initialCatalogState(initialCatalog, identity));
  const controllers = useRef(new Map<ArchitectureLayer, AbortController>());
  const identityKey = `${identity.scope}:${identity.baselineId}:${identity.projectionManifestId}`;
  const firstIdentityKey = useRef(identityKey);
  const mounted = useRef(false);

  useEffect(() => { if (firstIdentityKey.current === identityKey) return; firstIdentityKey.current = identityKey; dispatch({ type: "identityChanged", identity, requestKey: catalogRequestKey(identity, "") }); }, [identityKey]);

  const requestPage = (layer: ArchitectureLayer, cursor?: string, query = state.query) => {
    const requestKey = catalogRequestKey(state.identity, query);
    controllers.current.get(layer)?.abort();
    const controller = new AbortController();
    controllers.current.set(layer, controller);
    dispatch({ type: "pageRequested", layer, requestKey });
    runThreeAWebQuery<SearchArchitectureFactsResult>({ operation: "search", scope: state.identity.scope, baselineId: state.identity.baselineId, projectionManifestId: state.identity.projectionManifestId, layer, query: query || undefined, limit: 20, ...(cursor ? { cursor } : {}) }, controller.signal).then((page) => dispatch({ type: "pageLoaded", layer, requestKey, page })).catch((error) => { if (error instanceof DOMException && error.name === "AbortError") return; dispatch({ type: "pageFailed", layer, requestKey, errorCode: error instanceof Error ? error.message : "UNAVAILABLE" }); });
  };

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const timer = window.setTimeout(() => { dispatch({ type: "queryChanged", query: state.query, requestKey: catalogRequestKey(state.identity, state.query) }); layers.forEach(({ layer }) => requestPage(layer, undefined, state.query)); }, 300);
    return () => window.clearTimeout(timer);
  }, [state.query, identityKey]);

  const renderLane = (layer: ArchitectureLayer) => { const config = layers.find((item) => item.layer === layer)!; return <ArchitectureLane key={layer} layer={layer} state={state.layers[layer]} Icon={config.Icon} tone={config.tone} onFocus={onFocus} onLoadMore={() => requestPage(layer, state.layers[layer].nextCursor)} />; };
  return <div className="space-y-3" data-testid="architecture-catalog"><label className="relative block w-full md:w-72"><Search className="pointer-events-none absolute left-3 top-2.5 text-muted" size={16} /><span className="sr-only"><T k="threeA.search" /></span><input className="h-9 w-full rounded-md border border-border bg-white pl-9 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-blue-100" onChange={(event) => dispatch({ type: "queryChanged", query: event.target.value, requestKey: catalogRequestKey(state.identity, event.target.value) })} placeholder="Search published facts" value={state.query} /></label><div className="flex gap-1 rounded-md border border-border bg-chrome p-1 lg:hidden" role="tablist" aria-label="Architecture layer"><button className={`flex-1 rounded px-2 py-2 text-xs font-semibold ${state.activeMobileLayer === "BIZ" ? "bg-white text-ink shadow-sm" : "text-muted"}`} onClick={() => dispatch({ type: "mobileLayerChanged", layer: "BIZ" })} type="button">BIZ</button><button className={`flex-1 rounded px-2 py-2 text-xs font-semibold ${state.activeMobileLayer === "SYS" ? "bg-white text-ink shadow-sm" : "text-muted"}`} onClick={() => dispatch({ type: "mobileLayerChanged", layer: "SYS" })} type="button">SYS</button><button className={`flex-1 rounded px-2 py-2 text-xs font-semibold ${state.activeMobileLayer === "TECH" ? "bg-white text-ink shadow-sm" : "text-muted"}`} onClick={() => dispatch({ type: "mobileLayerChanged", layer: "TECH" })} type="button">TECH</button></div><div className="hidden h-[clamp(32rem,calc(100dvh-16rem),48rem)] min-h-0 gap-4 lg:grid lg:grid-cols-3">{layers.map(({ layer }) => renderLane(layer))}</div><div className="h-[clamp(32rem,calc(100dvh-16rem),48rem)] min-h-0 lg:hidden">{renderLane(state.activeMobileLayer)}</div></div>;
}
