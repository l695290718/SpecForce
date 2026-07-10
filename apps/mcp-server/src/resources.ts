import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildAssetGraph, getDomainGraphTarget, getStore, listCollectionAsMarkdown, renderAssetAsMarkdown } from "@specforge/core";

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

async function renderGraph(domainId?: string): Promise<string> {
  const graph = await buildAssetGraph(domainId);
  return [
    `# Asset Graph: ${getDomainGraphTarget(domainId)}`,
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
      async (uri) => markdownResource(uri.href, listCollectionAsMarkdown(assetType))
    );

    server.registerResource(
      `${path}-detail`,
      new ResourceTemplate(`specforge://${path}/{id}`, {
        list: async () => ({
          resources: getStore()[pathToCollection(path)].map((asset) => ({
            uri: `specforge://${path}/${asset.id}`,
            name: asset.name,
            mimeType: "text/markdown"
          }))
        })
      }),
      {
        title: `SpecForge ${path} detail`,
        description: `Agent-readable markdown detail for one SpecForge ${path} asset.`,
        mimeType: "text/markdown"
      },
      async (uri, variables) => markdownResource(uri.href, await renderAssetAsMarkdown(assetType, String(variables.id)))
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
    async (uri) => markdownResource(uri.href, await renderGraph())
  );

  server.registerResource(
    "graph-domain",
    new ResourceTemplate("specforge://graph/{domainId}", {
      list: async () => ({
        resources: getStore().domains.map((domain) => ({
          uri: `specforge://graph/${domain.id}`,
          name: `${domain.name} graph`,
          mimeType: "text/markdown"
        }))
      })
    }),
    {
      title: "SpecForge domain graph",
      description: "Agent-readable markdown graph filtered by a domain id.",
      mimeType: "text/markdown"
    },
    async (uri, variables) => markdownResource(uri.href, await renderGraph(String(variables.domainId)))
  );
}

function pathToCollection(path: string) {
  const map = {
    domains: "domains",
    "data-models": "dataModels",
    apis: "apis",
    events: "events",
    "business-rules": "businessRules",
    "state-machines": "stateMachines",
    integrations: "integrations",
    adrs: "adrs",
    proposals: "proposals",
    "context-packs": "contextPacks"
  } as const;
  return map[path as keyof typeof map];
}
