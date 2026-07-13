import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AssetGraph, AssetLocale } from "@specforge/core";
import { buildScopedAssetGraph, renderScopedAssetMarkdown, renderScopedCollectionMarkdown } from "./scoped-derived";

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

function resourceVariable(variables: Record<string, string | string[]>, key: string): string {
  const value = variables[key];
  const normalized = Array.isArray(value) ? value[0] : value;
  if (!normalized) throw new Error(`Missing resource variable: ${key}`);
  return normalized;
}

function resourceLocale(variables: Record<string, string | string[]>): AssetLocale {
  const locale = resourceVariable(variables, "locale");
  if (locale !== "en" && locale !== "zh") throw new Error(`Unsupported locale: ${locale}`);
  return locale;
}

function renderGraph(graph: AssetGraph, locale: AssetLocale, domainId?: string): string {
  const copy = locale === "zh"
    ? { title: "设计资产关系图", all: "全部领域", nodes: "节点", edges: "关系" }
    : { title: "Design Asset Graph", all: "all domains", nodes: "Nodes", edges: "Edges" };
  return [
    `# ${copy.title}: ${domainId ?? copy.all}`,
    "",
    `## ${copy.nodes}`,
    ...graph.nodes.map((node) => `- ${node.label} (${node.type}/${node.id}): ${node.summary}`),
    "",
    `## ${copy.edges}`,
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

  server.registerResource(
    "scoped-assets",
    new ResourceTemplate("specforge://scopes/{applicationServiceId}/{locale}/assets/{assetType}", { list: undefined }),
    {
      title: "Scoped localized design asset catalog",
      description: "Agent-readable catalog for exactly one authorized application service and locale.",
      mimeType: "text/markdown"
    },
    async (uri, variables) => {
      const result = await renderScopedCollectionMarkdown({
        applicationServiceId: resourceVariable(variables, "applicationServiceId"),
        locale: resourceLocale(variables),
        assetType: resourceVariable(variables, "assetType")
      });
      return markdownResource(uri.href, result.content);
    }
  );

  server.registerResource(
    "scoped-asset-detail",
    new ResourceTemplate("specforge://scopes/{applicationServiceId}/{locale}/assets/{assetType}/{id}", { list: undefined }),
    {
      title: "Scoped localized design asset detail",
      description: "Agent-readable asset detail with localized copy and canonical English source.",
      mimeType: "text/markdown"
    },
    async (uri, variables) => {
      const result = await renderScopedAssetMarkdown({
        applicationServiceId: resourceVariable(variables, "applicationServiceId"),
        locale: resourceLocale(variables),
        assetType: resourceVariable(variables, "assetType"),
        assetId: resourceVariable(variables, "id")
      });
      return markdownResource(uri.href, result.content);
    }
  );

  server.registerResource(
    "scoped-graph",
    new ResourceTemplate("specforge://scopes/{applicationServiceId}/{locale}/graph", { list: undefined }),
    {
      title: "Scoped localized design asset graph",
      description: "Agent-readable relationship graph for exactly one authorized application service.",
      mimeType: "text/markdown"
    },
    async (uri, variables) => {
      const locale = resourceLocale(variables);
      const result = await buildScopedAssetGraph({
        applicationServiceId: resourceVariable(variables, "applicationServiceId"),
        locale
      });
      return markdownResource(uri.href, renderGraph(result.graph, locale));
    }
  );
}
