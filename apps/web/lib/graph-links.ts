import type { AssetGraphNode } from "@specforge/core";
import { buildScopedHref } from "./scope";

export function buildScopedGraphAssetHref(node: Pick<AssetGraphNode, "id" | "logicalId" | "type">, scopeId: string): string {
  const routes: Record<string, string> = {
    domain: "domains", dataModel: "data-models", api: "apis", event: "events", businessRule: "rules",
    stateMachine: "state-machines", integration: "integrations", quality: "quality", observability: "observability", adr: "adrs"
  };
  const id = node.logicalId ?? node.id;
  if (node.type === "proposal") return buildScopedHref(`/proposals/${id}`, scopeId);
  if (node.type === "contextPack") return buildScopedHref(`/context-packs/${id}`, scopeId);
  return buildScopedHref(`/assets/${routes[node.type] ?? "domains"}/${id}`, scopeId);
}
