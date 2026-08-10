import type { KnowledgeProjectionNode } from "@specforge/core";
import type { ArchitectureLayer } from "../../lib/3a/workspace-loader";

export interface ThreeAQueryIdentity {
  scope: string;
  baselineId: string;
  projectionManifestId: string;
}

export interface CatalogPage {
  nodes: KnowledgeProjectionNode[];
  nextCursor?: string;
}

export interface CatalogLayerState {
  nodes: KnowledgeProjectionNode[];
  nextCursor?: string;
  loading: boolean;
  errorCode?: string;
  requestKey: string;
}

export interface CatalogState {
  identity: ThreeAQueryIdentity;
  query: string;
  activeMobileLayer: ArchitectureLayer;
  layers: Record<ArchitectureLayer, CatalogLayerState>;
}

export type CatalogAction =
  | { type: "queryChanged"; query: string; requestKey: string }
  | { type: "identityChanged"; identity: ThreeAQueryIdentity; requestKey: string }
  | { type: "pageRequested"; layer: ArchitectureLayer; requestKey: string }
  | { type: "pageLoaded"; layer: ArchitectureLayer; requestKey: string; page: CatalogPage }
  | { type: "pageFailed"; layer: ArchitectureLayer; requestKey: string; errorCode: string }
  | { type: "mobileLayerChanged"; layer: ArchitectureLayer };

export function initialCatalogState(initialPages: Partial<Record<ArchitectureLayer, CatalogPage>>, identity: ThreeAQueryIdentity): CatalogState {
  const requestKey = catalogRequestKey(identity, "");
  return { identity, query: "", activeMobileLayer: "BIZ", layers: { BIZ: layerFromPage(initialPages.BIZ, requestKey), SYS: layerFromPage(initialPages.SYS, requestKey), TECH: layerFromPage(initialPages.TECH, requestKey) } };
}

export function catalogReducer(state: CatalogState, action: CatalogAction): CatalogState {
  if (action.type === "queryChanged") return { ...state, query: action.query, layers: resetLayers(state.layers, action.requestKey) };
  if (action.type === "identityChanged") return initialCatalogState({}, action.identity);
  if (action.type === "mobileLayerChanged") return { ...state, activeMobileLayer: action.layer };
  const current = state.layers[action.layer];
  if (current.requestKey !== action.requestKey) return state;
  if (action.type === "pageRequested") return { ...state, layers: { ...state.layers, [action.layer]: { ...current, loading: true, errorCode: undefined } } };
  if (action.type === "pageFailed") return { ...state, layers: { ...state.layers, [action.layer]: { ...current, loading: false, errorCode: action.errorCode } } };
  const byId = new Map(current.nodes.map((node) => [node.assertionId, node]));
  for (const node of action.page.nodes) byId.set(node.assertionId, node);
  return { ...state, layers: { ...state.layers, [action.layer]: { nodes: [...byId.values()], nextCursor: action.page.nextCursor, loading: false, errorCode: undefined, requestKey: current.requestKey } } };
}

export function catalogRequestKey(identity: ThreeAQueryIdentity, query: string): string {
  return `${identity.scope}:${identity.baselineId}:${identity.projectionManifestId}:${query.trim().toLowerCase()}`;
}

function layerFromPage(page: CatalogPage | undefined, requestKey: string): CatalogLayerState {
  return { nodes: page?.nodes ?? [], ...(page?.nextCursor ? { nextCursor: page.nextCursor } : {}), loading: false, requestKey };
}

function resetLayers(layers: CatalogState["layers"], requestKey: string): CatalogState["layers"] {
  return { BIZ: { ...layers.BIZ, nodes: [], nextCursor: undefined, loading: false, errorCode: undefined, requestKey }, SYS: { ...layers.SYS, nodes: [], nextCursor: undefined, loading: false, errorCode: undefined, requestKey }, TECH: { ...layers.TECH, nodes: [], nextCursor: undefined, loading: false, errorCode: undefined, requestKey } };
}
