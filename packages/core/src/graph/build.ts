import { getStore } from "../repository";
import type { AssetGraph, AssetGraphEdge, AssetGraphNode, AssetRef, AssetType } from "../types";

function node(id: string, label: string, type: AssetType, summary: string, domainId?: string): AssetGraphNode {
  return { id, label, type, summary, domainId };
}

function edge(source: string, target: string, label: string): AssetGraphEdge {
  return { id: `${source}->${target}:${label}`, source, target, label };
}

function addRefEdges(edges: AssetGraphEdge[], source: string, refs: AssetRef[], label: string): void {
  refs.forEach((ref) => edges.push(edge(source, ref.id, label)));
}

export async function buildAssetGraph(domainId?: string, assetType?: AssetType): Promise<AssetGraph> {
  const store = getStore();
  const nodes: AssetGraphNode[] = [];
  const edges: AssetGraphEdge[] = [];
  const inDomain = (item: { domainId?: string }) => !domainId || item.domainId === domainId || !item.domainId;

  store.domains.filter((domain) => !domainId || domain.id === domainId).forEach((domain) => nodes.push(node(domain.id, domain.name, "domain", domain.description, domain.id)));
  store.dataModels.filter(inDomain).forEach((model) => {
    nodes.push(node(model.id, model.name, "dataModel", model.description, model.domainId));
    edges.push(edge(model.domainId, model.id, "owns model"));
  });
  store.apis.filter(inDomain).forEach((api) => {
    nodes.push(node(api.id, api.name, "api", `${api.method} ${api.path}`, api.domainId));
    edges.push(edge(api.domainId, api.id, "provides api"));
  });
  store.events.filter(inDomain).forEach((event) => {
    nodes.push(node(event.id, event.name, "event", event.topic, event.domainId));
    edges.push(edge(event.domainId, event.id, "emits event"));
  });
  store.businessRules.filter(inDomain).forEach((rule) => {
    nodes.push(node(rule.id, rule.name, "businessRule", rule.description, rule.domainId));
    addRefEdges(edges, rule.id, rule.relatedAssets, "governs");
  });
  store.stateMachines.filter(inDomain).forEach((machine) => {
    nodes.push(node(machine.id, machine.name, "stateMachine", machine.description, machine.domainId));
    edges.push(edge(machine.domainId, machine.id, "controls state"));
  });
  store.integrations.filter(inDomain).forEach((integration) => {
    nodes.push(node(integration.id, integration.name, "integration", `${integration.sourceSystem} -> ${integration.targetSystem}`, integration.domainId));
    edges.push(edge(integration.domainId!, integration.id, "integrates"));
  });
  store.qualityRequirements.filter(inDomain).forEach((quality) => {
    nodes.push(node(quality.id, quality.name, "quality", quality.target, quality.domainId));
    edges.push(edge(quality.id, quality.assetId, "verifies"));
  });
  store.observabilityDesigns.filter(inDomain).forEach((obs) => {
    nodes.push(node(obs.id, obs.name, "observability", obs.slo, obs.domainId));
    edges.push(edge(obs.id, obs.assetId, "observes"));
  });
  store.adrs.filter(inDomain).forEach((adr) => {
    nodes.push(node(adr.id, adr.title, "adr", adr.decision, adr.domainId));
    addRefEdges(edges, adr.id, adr.relatedAssets, "decides");
  });
  store.proposals.filter(inDomain).forEach((proposal) => {
    nodes.push(node(proposal.id, proposal.title, "proposal", proposal.description, proposal.domainId));
    addRefEdges(edges, proposal.id, proposal.impactedAssets, "impacts");
  });

  const filteredNodes = assetType ? nodes.filter((item) => item.type === "domain" || item.type === assetType) : nodes;
  const nodeIds = new Set(filteredNodes.map((item) => item.id));
  return {
    nodes: filteredNodes,
    edges: edges.filter((item) => nodeIds.has(item.source) && nodeIds.has(item.target))
  };
}
