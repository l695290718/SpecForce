import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AssetGraph, AssetType } from "@specforge/core";
import { listPersistedAssetLinks, listPersistedAssets, listPersistedCollectionAsMarkdown, listPersistedContextPacks, listPersistedProposals, renderPersistedAssetAsMarkdown } from "./persistence";

const resourceTypes = [
  ["domains", "domain"],
  ["data-models", "dataModel"],
  ["apis", "api"],
  ["events", "event"],
  ["business-rules", "businessRule"],
  ["state-machines", "stateMachine"],
  ["integrations", "integration"],
  ["adrs", "adr"],
  ["proposals", "proposal"],
  ["context-packs", "contextPack"]
] as const;

function markdownResource(uri: string, text: string) {
  return {
    contents: [{ uri, mimeType: "text/markdown", text }]
  };
}

async function renderGraph(applicationServiceId: string, domainId?: string): Promise<string> {
  const graph = await buildPersistedGraph(applicationServiceId, domainId);
  return [
    `# Asset Graph: ${domainId ?? "all domains"}`,
    "",
    "## Nodes",
    ...graph.nodes.map((node) => `- ${node.label} (${node.type}/${node.id}): ${node.summary}`),
    "",
    "## Edges",
    ...graph.edges.map((edge) => `- ${edge.source} --${edge.label}--> ${edge.target}`),
    "",
    "```json",
    JSON.stringify(graph, null, 2),
    "```"
  ].join("\n");
}

export function registerResources(server: McpServer): void {
  for (const [path, assetType] of resourceTypes) {
    server.registerResource(
      path,
      `specforge://${path}`,
      {
        title: `SpecForge ${path}`,
        description: `Agent-readable markdown catalog for SpecForge ${path}.`,
        mimeType: "text/markdown"
      },
      async (uri) => markdownResource(uri.href, "# Scoped resource required\n\nUse the MCP search_design_assets tool with applicationServiceId. Static resources do not select a service scope.")
    );

    server.registerResource(
      `${path}-detail`,
      new ResourceTemplate(`specforge://${path}/{id}`, {
        list: async () => ({
          resources: []
        })
      }),
      {
        title: `SpecForge ${path} detail`,
        description: `Agent-readable markdown detail for one SpecForge ${path} asset.`,
        mimeType: "text/markdown"
      },
      async (uri) => markdownResource(uri.href, "# Scoped resource required\n\nUse get_asset_detail with applicationServiceId.")
    );
  }

  server.registerResource(
    "graph",
    "specforge://graph",
    {
      title: "SpecForge asset graph",
      description: "Agent-readable markdown graph of all design asset relationships.",
      mimeType: "text/markdown"
    },
    async (uri) => markdownResource(uri.href, "# Scoped resource required\n\nUse scoped MCP tools to retrieve design data.")
  );

  server.registerResource(
    "graph-domain",
    new ResourceTemplate("specforge://graph/{domainId}", {
      list: async () => ({
          resources: []
      })
    }),
    {
      title: "SpecForge domain graph",
      description: "Agent-readable markdown graph filtered by a domain id.",
      mimeType: "text/markdown"
    },
    async (uri) => markdownResource(uri.href, "# Scoped resource required\n\nUse scoped MCP tools to retrieve design data.")
  );
}

async function buildPersistedGraph(applicationServiceId: string, domainId?: string): Promise<AssetGraph> {
  const assets = await listPersistedAssets(applicationServiceId);
  const assetLinks = await listPersistedAssetLinks(applicationServiceId);
  const proposals = await listPersistedProposals(applicationServiceId);
  const contextPacks = await listPersistedContextPacks(applicationServiceId);
  const nodes: AssetGraph["nodes"] = [];
  const edges: AssetGraph["edges"] = [];

  for (const { type, asset } of assets) {
    if (domainId && "domainId" in asset && asset.domainId !== domainId && asset.id !== domainId) continue;
    nodes.push({ id: asset.id, label: "title" in asset && asset.title ? asset.title : asset.name, type, domainId: "domainId" in asset ? asset.domainId : undefined, summary: "description" in asset ? asset.description : asset.id });
    if ("domainId" in asset && asset.domainId && asset.id !== asset.domainId) {
      edges.push({ id: `${asset.domainId}->${asset.id}`, source: asset.domainId, target: asset.id, label: "owns" });
    }
  }

  for (const proposal of proposals) {
    if (domainId && proposal.domainId !== domainId) continue;
    nodes.push({ id: proposal.id, label: proposal.title, type: "proposal", domainId: proposal.domainId, summary: proposal.description });
    proposal.impactedAssets.forEach((ref) => {
      if (nodes.some((node) => node.id === ref.id)) edges.push({ id: `${proposal.id}->${ref.id}`, source: proposal.id, target: ref.id, label: "impacts" });
    });
  }

  for (const link of assetLinks) {
    if (!nodes.some((node) => node.id === link.sourceId) || !nodes.some((node) => node.id === link.targetId)) continue;
    edges.push({ id: link.id, source: link.sourceId, target: link.targetId, label: link.relationType });
  }

  for (const pack of contextPacks) {
    if (domainId) continue;
    nodes.push({ id: pack.id, label: pack.name, type: "contextPack", summary: pack.summary });
    if (nodes.some((node) => node.id === pack.proposalId)) edges.push({ id: `${pack.proposalId}->${pack.id}`, source: pack.proposalId, target: pack.id, label: "generates" });
  }

  return { nodes: dedupe(nodes), edges: dedupe(edges) };
}

function dedupe<T extends { id: string }>(items: T[]): T[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}
