"use client";

import type { ArchitectureUnitFilter } from "@specforge/core";
import type { ArchitectureMapQueryResult, ArchitectureUnitNeighborhoodResult } from "@specforge/knowledge-query";
import { ArrowLeft, Network, PanelsTopLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { T } from "../language-provider";
import { runArchitectureMapQuery, runArchitectureUnitNeighborhoodQuery } from "../../lib/3a/query-client";
import { serializeThreeAUrlState, type ThreeAUrlState } from "../../lib/3a/url-state";
import type { ThreeAQueryIdentity } from "./catalog-state";
import { ArchitectureMapFilterBar } from "./architecture-map-filter-bar";
import { ArchitectureMapRenderer } from "./architecture-map-renderer";
import { ArchitectureUnitInspector } from "./architecture-unit-inspector";

export function ArchitectureMapWorkspace({ state, identity, generationId, initialMap, initialNeighborhood }: { state: ThreeAUrlState; identity: ThreeAQueryIdentity; generationId: string; initialMap?: ArchitectureMapQueryResult; initialNeighborhood?: ArchitectureUnitNeighborhoodResult }) {
  const [map, setMap] = useState(initialMap);
  const [neighborhood, setNeighborhood] = useState(initialNeighborhood);
  const [loading, setLoading] = useState(false);
  const [errorCode, setErrorCode] = useState<string>();
  const initialFilters = useMemo<ArchitectureUnitFilter>(() => ({
    ...(state.mapQuery ? { query: state.mapQuery } : {}),
    ...(state.mapLayers?.length ? { layers: state.mapLayers } : {}),
    ...(state.mapKinds?.length ? { kinds: state.mapKinds as ArchitectureUnitFilter["kinds"] } : {}),
    ...(state.mappingFamilies?.length ? { mappingFamilies: state.mappingFamilies } : {}),
    ...(state.minCriticality !== undefined ? { minCriticality: state.minCriticality } : {}),
    ...(state.minCompleteness !== undefined ? { minCompleteness: state.minCompleteness } : {}),
    ...(state.includeUnclassified !== undefined ? { includeUnclassified: state.includeUnclassified } : {})
  }), [state]);
  const [filters, setFilters] = useState<ArchitectureUnitFilter>(initialFilters);
  const identityKey = identity.scope + ":" + identity.baselineId + ":" + identity.projectionManifestId + ":" + generationId;

  const updateUrl = useCallback((changes: Record<string, string | undefined>) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    Object.entries(changes).forEach(([key, value]) => value ? params.set(key, value) : params.delete(key));
    window.history.replaceState(null, "", window.location.pathname + "?" + params.toString());
    window.dispatchEvent(new Event("three-a-url-state-change"));
  }, []);

  const loadMap = useCallback(async (nextFilters: ArchitectureUnitFilter) => {
    setLoading(true);
    setErrorCode(undefined);
    try {
      const result = await runArchitectureMapQuery({ operation: "architectureMap", scope: identity.scope, baselineId: identity.baselineId, projectionManifestId: identity.projectionManifestId, generationId, filter: nextFilters, budget: { maxUnitsPerLayer: 12, maxMappings: 60, timeoutMs: 2_000, maxPayloadBytes: 524_288 } });
      setMap(result);
    } catch (error) {
      setErrorCode(error instanceof Error ? error.message : "UNAVAILABLE");
    } finally {
      setLoading(false);
    }
  }, [generationId, identity.baselineId, identity.projectionManifestId, identity.scope]);

  const loadNeighborhood = useCallback(async (unitIdentity: string) => {
    setLoading(true);
    setErrorCode(undefined);
    try {
      const result = await runArchitectureUnitNeighborhoodQuery({ operation: "architectureUnitNeighborhood", scope: identity.scope, baselineId: identity.baselineId, projectionManifestId: identity.projectionManifestId, generationId, unitIdentity, direction: state.direction, depth: 2, budget: { maxUnitsPerLayer: 12, maxMappings: 60, timeoutMs: 2_000, maxPayloadBytes: 524_288 } });
      setNeighborhood(result);
      updateUrl({ unit: unitIdentity });
    } catch (error) {
      setErrorCode(error instanceof Error ? error.message : "UNAVAILABLE");
    } finally {
      setLoading(false);
    }
  }, [generationId, identity.baselineId, identity.projectionManifestId, identity.scope, state.direction, updateUrl]);

  useEffect(() => {
    setMap(initialMap);
    setNeighborhood(initialNeighborhood);
    setFilters(initialFilters);
  }, [identityKey, initialMap, initialNeighborhood, initialFilters]);

  useEffect(() => {
    if (!initialMap || state.unit) return;
    const timer = window.setTimeout(() => { void loadMap(filters); }, 350);
    return () => window.clearTimeout(timer);
  }, [filters, initialMap, loadMap, state.unit]);

  const onFilters = (next: ArchitectureUnitFilter) => {
    setFilters(next);
    updateUrl({
      mapQuery: next.query,
      mapLayers: next.layers?.join(","),
      mapKinds: next.kinds?.join(","),
      minCriticality: next.minCriticality === undefined ? undefined : String(next.minCriticality),
      minCompleteness: next.minCompleteness === undefined ? undefined : String(next.minCompleteness),
      includeUnclassified: next.includeUnclassified ? "true" : undefined
    });
  };
  const closeInspector = () => { setNeighborhood(undefined); updateUrl({ unit: undefined }); };
  const representationHref = (representation: "map" | "network") => {
    const next: ThreeAUrlState = { ...state, graphRepresentation: representation, ...(representation === "network" ? { unit: undefined } : {}) };
    return "/architecture/3a?" + serializeThreeAUrlState(next);
  };

  return <div className="space-y-3" data-testid="architecture-map-workspace">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><div className="flex items-center gap-2 text-sm font-semibold text-ink"><PanelsTopLeft className="text-accent" size={17} /><T k="threeA.map" /></div><p className="mt-1 text-xs text-muted"><T k="threeA.mapDescription" /></p></div>
      <div className="flex items-center gap-1 rounded-md border border-border bg-chrome p-1"><a className="inline-flex h-8 items-center gap-1 rounded bg-white px-2 text-xs font-semibold text-ink shadow-sm" href={representationHref("map")}><PanelsTopLeft size={13} /><T k="threeA.map" /></a><a className="inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold text-muted hover:bg-white" href={representationHref("network")}><Network size={13} /><T k="threeA.network" /></a></div>
    </div>
    <ArchitectureMapFilterBar value={filters} onChange={onFilters} />
    {loading ? <p className="rounded-md border border-border bg-white p-3 text-xs text-muted"><T k="threeA.loading" /></p> : null}
    {errorCode ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700"><T k="threeA.queryFailed" /> · {errorCode}</p> : null}
    {map && !neighborhood ? <ArchitectureMapRenderer result={map} onSelect={(unitIdentity) => void loadNeighborhood(unitIdentity)} /> : null}
    {!map && !neighborhood ? <div className="rounded-lg border border-dashed border-border bg-white p-8 text-center text-sm text-muted"><T k="threeA.unitNoDetail" /></div> : null}
    {neighborhood ? <><button className="inline-flex items-center gap-2 text-xs font-semibold text-accent" onClick={closeInspector} type="button"><ArrowLeft size={14} /><T k="threeA.backToMap" /></button><ArchitectureUnitInspector result={neighborhood} onClose={closeInspector} onSelect={(unitIdentity) => void loadNeighborhood(unitIdentity)} /></> : null}
  </div>;
}
