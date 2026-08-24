import type { ArchitectureScopeRef, ArchitectureUnitKind, KnowledgeProjectionEdge, PublishedBaselineDrift } from "@specforge/core";
import type {
  ArchitectureMapQueryResult,
  ArchitectureUnitNeighborhoodResult,
  ArchitectureFactDetail,
  SearchArchitectureFactsResult,
  PublishedBaselineSummary,
  ThreeAProjectionQueryService,
  TraceArchitecturePathResult
} from "@specforge/knowledge-query";
import type { ResolvedThreeARequest } from "./principal";
import type { ThreeAUrlState } from "./url-state";

export interface BaselineOption {
  id: string;
  publishedAt: string;
  status: string;
}

export interface ManifestOption {
  id: string;
  generationId?: string;
  profileVersion: string;
  publishedAt: string;
}

export type ArchitectureLayer = "BIZ" | "SYS" | "TECH";
export type LayerPages = Record<ArchitectureLayer, SearchArchitectureFactsResult>;

export interface InitialGraphPage {
  focusId: string;
  detail: ArchitectureFactDetail;
  trace: TraceArchitecturePathResult;
}

export interface ThreeAWorkspaceData {
  state: ThreeAUrlState;
  baselines: BaselineOption[];
  manifests: ManifestOption[];
  initialCatalog?: LayerPages;
  initialGraph?: InitialGraphPage;
  initialGraphEdges?: KnowledgeProjectionEdge[];
  initialArchitectureMap?: ArchitectureMapQueryResult;
  initialArchitectureUnitNeighborhood?: ArchitectureUnitNeighborhoodResult;
  alignmentEdges?: KnowledgeProjectionEdge[];
  drift?: PublishedBaselineDrift;
  errorCode?: string;
  /** Transitional fields retained for consumers migrating to view-owned data. */
  nodes?: SearchArchitectureFactsResult["nodes"];
  edges?: KnowledgeProjectionEdge[];
  coverage?: ThreeACoverageReport;
}

export interface ThreeACoverageReport {
  freshness: "CURRENT" | "STALE";
  manifest?: { id: string; generationId: string; inputDigest: string; contentDigest: string; catalogVersion: string; relationshipVersion: string; rowCount: number; coveredCount: number; blockedCount: number; notEvaluatedCount: number };
  rows: Array<{ assetType: string; assetId: string; role: string; status: string; terminalMemberId?: string | null; pathEvidence?: unknown; reasonCode?: string | null; diagnosticRef?: string | null; sourceDigest?: string | null; rowDigest: string }>;
}

export async function loadThreeAWorkspaceData(
  service: ThreeAProjectionQueryService,
  request: ResolvedThreeARequest,
  state: ThreeAUrlState
): Promise<ThreeAWorkspaceData> {
  const baselines = await service.listPublishedBaselines(request);
  const selectedBaseline = selectBaseline(baselines, state.baseline);
  const manifests = selectedBaseline ? await service.listProjectionManifests({ ...request, baselineId: selectedBaseline.id }) : [];
  const selectedManifest = manifests.find((manifest) => manifest.id === state.projection) ?? manifests[0];
  const activeState: ThreeAUrlState = {
    ...state,
    ...(selectedBaseline ? { baseline: selectedBaseline.id } : {}),
    ...(selectedManifest ? { projection: selectedManifest.id } : {})
  };
  const base: ThreeAWorkspaceData = {
    state: activeState,
    baselines: baselines.map(toBaselineOption),
    manifests: manifests.map(toManifestOption)
  };

  if (!selectedBaseline || !selectedManifest) return base;

  const queryIdentity = {
    ...request,
    baselineId: selectedBaseline.id,
    projectionManifestId: selectedManifest.id
  };

  if (state.tab === "coverage") return base;

  if (state.tab === "alignment") {
    const alignment = await service.getArchitectureAlignment(queryIdentity);
    return { ...base, alignmentEdges: alignment.edges };
  }

  if (state.tab === "drift") {
    return { ...base, drift: await loadPublishedDrift(service, request, selectedBaseline, baselines, selectedManifest.id) };
  }

  if (state.mode === "graph") {
    if (state.graphRepresentation === "map" && selectedManifest.generationId) {
      if (state.unit) {
        return {
          ...base,
          initialArchitectureUnitNeighborhood: await service.architectureUnitNeighborhood({
            ...queryIdentity,
            generationId: selectedManifest.generationId,
            unitIdentity: state.unit,
            direction: state.direction,
            depth: 2,
            budget: { maxUnitsPerLayer: 12, maxMappings: 60, timeoutMs: 2_000, maxPayloadBytes: 524_288 }
          })
        };
      }
      return {
        ...base,
        initialArchitectureMap: await service.architectureMap({
          ...queryIdentity,
          generationId: selectedManifest.generationId,
          filter: {
            ...(state.mapQuery ? { query: state.mapQuery } : {}),
            ...(state.mapLayers?.length ? { layers: state.mapLayers } : {}),
            ...(state.mapKinds?.length ? { kinds: state.mapKinds as ArchitectureUnitKind[] } : {}),
            ...(state.mappingFamilies?.length ? { mappingFamilies: state.mappingFamilies } : {}),
            ...(state.minCriticality !== undefined ? { minCriticality: state.minCriticality } : {}),
            ...(state.minCompleteness !== undefined ? { minCompleteness: state.minCompleteness } : {}),
            ...(state.includeUnclassified !== undefined ? { includeUnclassified: state.includeUnclassified } : {})
          },
          budget: { maxUnitsPerLayer: 12, maxMappings: 60, timeoutMs: 2_000, maxPayloadBytes: 524_288 }
        })
      };
    }
    if (!state.focus) {
      const [layers, alignment] = await Promise.all([
        Promise.all((["BIZ", "SYS", "TECH"] as const).map(async (layer) => [layer, await service.searchArchitectureFacts({ ...queryIdentity, layer, limit: 200 })] as const)),
        service.getArchitectureAlignment({ ...queryIdentity, limit: 1200 })
      ]);
      return { ...base, initialCatalog: Object.fromEntries(layers) as LayerPages, initialGraphEdges: alignment.edges };
    }
    const [detail, trace] = await Promise.all([
      service.getArchitectureFactDetail({ ...queryIdentity, assertionId: state.focus }),
      service.traceArchitecturePath({
        ...queryIdentity,
        startAssertionId: state.focus,
        direction: state.direction,
        budget: { maxDepth: 1, maxNodes: 100, maxEdges: 200, maxPaths: 100, timeoutMs: 2_000, maxPayloadBytes: 524_288 }
      })
    ]);
    return { ...base, initialGraph: { focusId: state.focus, detail, trace } };
  }

  const layers = await Promise.all(([
    ["BIZ", "BIZ"],
    ["SYS", "SYS"],
    ["TECH", "TECH"]
  ] as const).map(async ([key, layer]) => [key, await service.searchArchitectureFacts({ ...queryIdentity, layer, limit: 20 })] as const));
  return { ...base, initialCatalog: Object.fromEntries(layers) as LayerPages };
}

function selectBaseline(baselines: PublishedBaselineSummary[], id?: string) {
  return baselines.find((baseline) => baseline.id === id) ?? baselines[0];
}

function toBaselineOption(baseline: PublishedBaselineSummary): BaselineOption {
  return { id: baseline.id, status: baseline.status, publishedAt: baseline.publishedAt };
}

function toManifestOption(manifest: { id: string; generationId: string; profileVersion: string; publishedAt: string }): ManifestOption {
  return { id: manifest.id, generationId: manifest.generationId, profileVersion: manifest.profileVersion, publishedAt: manifest.publishedAt };
}

async function loadPublishedDrift(
  service: ThreeAProjectionQueryService,
  request: ResolvedThreeARequest,
  base: PublishedBaselineSummary,
  baselines: PublishedBaselineSummary[],
  baseManifestId: string
): Promise<PublishedBaselineDrift | undefined> {
  const target = baselines.find((candidate) => candidate.id !== base.id);
  if (!target) return undefined;
  const targetManifests = await service.listProjectionManifests({ ...request, baselineId: target.id });
  const targetManifest = targetManifests[0];
  if (!targetManifest) return undefined;
  return service.comparePublishedBaselines({
    ...request,
    baseBaselineId: base.id,
    targetBaselineId: target.id,
    baseProjectionManifestId: baseManifestId,
    targetProjectionManifestId: targetManifest.id
  });
}

export type ThreeAWorkspaceScope = ArchitectureScopeRef;
