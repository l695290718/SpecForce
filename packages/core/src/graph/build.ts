import { assetCollections, getStore, localizeCatalogAsset } from "../repository";
import type {
  Asset,
  AssetGraph,
  AssetGraphEdge,
  AssetGraphNode,
  AssetRef,
  AssetType,
  DerivedViewOptions,
  SpecForgeDataStore
} from "../types";

type GraphAsset = Asset & { architectureScope?: { applicationServiceId: string; scopePath: string } };

const graphAssetTypes = (Object.keys(assetCollections) as AssetType[]).filter((type) => type !== "contextPack");

function graphAssets(store: SpecForgeDataStore): Array<{ type: AssetType; asset: GraphAsset }> {
  return graphAssetTypes.flatMap((type) => (
    store[assetCollections[type]] as GraphAsset[]
  ).map((asset) => ({ type, asset })));
}

function buildIdentityMap(store: SpecForgeDataStore): Map<GraphAsset, string> {
  const entries = graphAssets(store);
  const counts = new Map<string, number>();
  const used = new Map<string, number>();
  const identities = new Map<GraphAsset, string>();

  entries.forEach(({ asset }) => counts.set(asset.id, (counts.get(asset.id) ?? 0) + 1));
  entries.forEach(({ type, asset }) => {
    if ((counts.get(asset.id) ?? 0) === 1) {
      identities.set(asset, asset.id);
      return;
    }

    const scopeIdentity = asset.architectureScope?.applicationServiceId ?? asset.architectureScope?.scopePath ?? "unscoped";
    const base = `${scopeIdentity}::${type}::${asset.id}`;
    const occurrence = used.get(base) ?? 0;
    used.set(base, occurrence + 1);
    identities.set(asset, occurrence === 0 ? base : `${base}::${occurrence + 1}`);
  });

  return identities;
}

function sameScope(left: GraphAsset, right: GraphAsset): boolean {
  if (!left.architectureScope || !right.architectureScope) return !left.architectureScope && !right.architectureScope;
  return left.architectureScope.applicationServiceId === right.architectureScope.applicationServiceId
    && left.architectureScope.scopePath === right.architectureScope.scopePath;
}

export async function buildAssetGraph(domainId?: string, assetType?: AssetType, options: DerivedViewOptions = {}): Promise<AssetGraph> {
  const store = getStore(options.catalog);
  const locale = options.locale ?? "en";
  const identities = buildIdentityMap(store);
  const allAssets = graphAssets(store);
  const nodes: AssetGraphNode[] = [];
  const edges: AssetGraphEdge[] = [];
  const inDomain = (item: { domainId?: string }) => !domainId || item.domainId === domainId || !item.domainId;

  const identityOf = (asset: GraphAsset) => identities.get(asset) ?? asset.id;
  const resolveTarget = (source: GraphAsset, targetType: AssetType, logicalId: string): { id: string; asset?: GraphAsset } => {
    const candidates = allAssets.filter((entry) => entry.type === targetType && entry.asset.id === logicalId).map((entry) => entry.asset);
    const target = source.architectureScope
      ? candidates.find((candidate) => sameScope(source, candidate))
      : candidates.find((candidate) => !candidate.architectureScope) ?? (candidates.length === 1 ? candidates[0] : undefined);
    return { id: target ? identityOf(target) : logicalId, asset: target };
  };
  const addNode = (type: AssetType, canonical: GraphAsset, label: string, summary: string, nodeDomainId?: string) => {
    nodes.push({
      id: identityOf(canonical),
      logicalId: canonical.id,
      label,
      type,
      summary,
      domainId: nodeDomainId,
      applicationServiceId: canonical.architectureScope?.applicationServiceId,
      architectureScope: canonical.architectureScope
    });
  };
  const addEdge = (
    owner: GraphAsset,
    sourceType: AssetType,
    sourceLogicalId: string,
    targetType: AssetType,
    targetLogicalId: string,
    label: string
  ) => {
    const source = resolveTarget(owner, sourceType, sourceLogicalId);
    const target = resolveTarget(owner, targetType, targetLogicalId);
    if (!source.asset || !target.asset) return;
    edges.push({
      id: `${source.id}->${target.id}:${label}`,
      source: source.id,
      target: target.id,
      sourceLogicalId,
      targetLogicalId,
      label,
      applicationServiceId: owner.architectureScope?.applicationServiceId,
      architectureScope: owner.architectureScope
    });
  };
  const addRefEdges = (sourceType: AssetType, source: GraphAsset, refs: AssetRef[], label: string) => {
    refs.forEach((ref) => addEdge(source, sourceType, source.id, ref.type, ref.id, label));
  };

  store.domains.filter((domain) => !domainId || domain.id === domainId).forEach((canonical) => {
    const domain = localizeCatalogAsset("domain", canonical, locale, options.catalog);
    addNode("domain", canonical, domain.name, domain.description, domain.id);
  });
  store.dataModels.filter(inDomain).forEach((canonical) => {
    const model = localizeCatalogAsset("dataModel", canonical, locale, options.catalog);
    addNode("dataModel", canonical, model.name, model.description, model.domainId);
    addEdge(canonical, "domain", model.domainId, "dataModel", model.id, "owns model");
  });
  store.apis.filter(inDomain).forEach((canonical) => {
    const api = localizeCatalogAsset("api", canonical, locale, options.catalog);
    addNode("api", canonical, api.name, `${api.method} ${api.path}`, api.domainId);
    addEdge(canonical, "domain", api.domainId, "api", api.id, "provides api");
  });
  store.events.filter(inDomain).forEach((canonical) => {
    const event = localizeCatalogAsset("event", canonical, locale, options.catalog);
    addNode("event", canonical, event.name, event.topic, event.domainId);
    addEdge(canonical, "domain", event.domainId, "event", event.id, "emits event");
  });
  store.businessRules.filter(inDomain).forEach((canonical) => {
    const rule = localizeCatalogAsset("businessRule", canonical, locale, options.catalog);
    addNode("businessRule", canonical, rule.name, rule.description, rule.domainId);
    addRefEdges("businessRule", canonical, rule.relatedAssets, "governs");
  });
  store.stateMachines.filter(inDomain).forEach((canonical) => {
    const machine = localizeCatalogAsset("stateMachine", canonical, locale, options.catalog);
    addNode("stateMachine", canonical, machine.name, machine.description, machine.domainId);
    addEdge(canonical, "domain", machine.domainId, "stateMachine", machine.id, "controls state");
  });
  store.integrations.filter(inDomain).forEach((canonical) => {
    const integration = localizeCatalogAsset("integration", canonical, locale, options.catalog);
    addNode("integration", canonical, integration.name, `${integration.sourceSystem} -> ${integration.targetSystem}`, integration.domainId);
    if (integration.domainId) addEdge(canonical, "domain", integration.domainId, "integration", integration.id, "integrates");
  });
  store.qualityRequirements.filter(inDomain).forEach((canonical) => {
    const quality = localizeCatalogAsset("quality", canonical, locale, options.catalog);
    addNode("quality", canonical, quality.name, quality.target, quality.domainId);
    addEdge(canonical, "quality", quality.id, quality.assetType, quality.assetId, "verifies");
  });
  store.observabilityDesigns.filter(inDomain).forEach((canonical) => {
    const observability = localizeCatalogAsset("observability", canonical, locale, options.catalog);
    addNode("observability", canonical, observability.name, observability.slo, observability.domainId);
    addEdge(canonical, "observability", observability.id, observability.assetType, observability.assetId, "observes");
  });
  store.adrs.filter(inDomain).forEach((canonical) => {
    const adr = localizeCatalogAsset("adr", canonical, locale, options.catalog);
    addNode("adr", canonical, adr.title, adr.decision, adr.domainId);
    addRefEdges("adr", canonical, adr.relatedAssets, "decides");
  });
  store.proposals.filter(inDomain).forEach((canonical) => {
    const proposal = localizeCatalogAsset("proposal", canonical, locale, options.catalog);
    addNode("proposal", canonical, proposal.title, proposal.description, proposal.domainId);
    addRefEdges("proposal", canonical, proposal.impactedAssets, "impacts");
  });

  const filteredNodes = assetType ? nodes.filter((item) => item.type === "domain" || item.type === assetType) : nodes;
  const nodeIds = new Set(filteredNodes.map((item) => item.id));
  return { nodes: filteredNodes, edges: edges.filter((item) => nodeIds.has(item.source) && nodeIds.has(item.target)) };
}
