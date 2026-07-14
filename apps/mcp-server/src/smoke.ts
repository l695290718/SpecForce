import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const applicationServiceId = "com.huawei.celon.desiner";
const architectureScope = {
  applicationServiceId,
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

function firstText(result: unknown): string {
  if (!result || typeof result !== "object" || !("content" in result)) return "";
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  const first = content[0];
  return first && typeof first === "object" && "type" in first && first.type === "text" && "text" in first ? String(first.text) : "";
}

function requireSuccess(name: string, result: unknown): string {
  if (result && typeof result === "object" && "isError" in result && result.isError) {
    throw new Error(`${name} failed: ${firstText(result)}`);
  }
  return firstText(result);
}

async function requireFailure(name: string, operation: () => Promise<unknown>): Promise<string> {
  try {
    const result = await operation();
    if (result && typeof result === "object" && "isError" in result && result.isError) return firstText(result);
    throw new Error(`${name} unexpectedly succeeded.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("unexpectedly succeeded")) throw error;
    return message;
  }
}

async function main() {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const transport = new StdioClientTransport({
    command,
    args: ["--filter", "@specforge/mcp-server", "dev"],
    cwd: process.cwd(),
    stderr: "pipe"
  });
  const client = new Client({ name: "specforge-smoke", version: "0.1.0" }, { capabilities: {} });

  await client.connect(transport);
  const [tools, resources, templates, prompts] = await Promise.all([
    client.listTools(),
    client.listResources(),
    client.listResourceTemplates(),
    client.listPrompts()
  ]);

  const search = await client.callTool({
    name: "search_design_assets",
    arguments: { applicationServiceId, query: "proposal-specforge-self-design", limit: 10 }
  });
  const contextPackJson = await client.callTool({
    name: "generate_context_pack",
    arguments: { applicationServiceId, locale: "en", proposalId: "proposal-specforge-self-design", targetAgent: "codex", format: "json" }
  });
  const graphZh = await client.callTool({
    name: "get_asset_graph",
    arguments: { applicationServiceId, locale: "zh" }
  });
  const governance = await client.callTool({
    name: "run_governance_checks",
    arguments: { applicationServiceId, locale: "en", targetType: "proposal", targetId: "proposal-specforge-self-design" }
  });
  const generatedPackEnvelope = JSON.parse(requireSuccess("generate_context_pack(json)", contextPackJson));
  const generatedPack = generatedPackEnvelope.canonicalSource.generatedContextPack;
  const exportedPack = await client.callTool({
    name: "export_context_pack",
    arguments: {
      applicationServiceId,
      contextPackId: generatedPack.id,
      locale: "zh",
      format: "json"
    }
  });
  const scopedDomainResource = await client.readResource({
    uri: `specforge://scopes/${applicationServiceId}/zh/assets/domain`
  });
  const missingScopeFailure = await requireFailure("missing scope", () => client.callTool({
    name: "get_asset_graph",
    arguments: { locale: "en" }
  }));
  const deniedScopeFailure = await requireFailure("denied scope", () => client.callTool({
    name: "get_asset_graph",
    arguments: { applicationServiceId: "com.huawei.celon.runtime", locale: "en" }
  }));
  const link = await client.callTool({
    name: "link_assets",
    arguments: {
      sourceType: "quality",
      sourceId: "quality-specforge-impact-ready",
      targetType: "dataModel",
      targetId: "data-specforge-asset-graph",
      relationType: "verifies",
      description: "Smoke verifies persisted asset link writes.",
      architectureScope
    }
  });

  await client.close();

  const searchText = requireSuccess("search_design_assets", search);
  const packText = generatedPack.generatedMarkdown as string;
  const graphZhText = requireSuccess("get_asset_graph(zh)", graphZh);
  const exportedPackText = requireSuccess("export_context_pack(zh)", exportedPack);
  const graphZhEnvelope = JSON.parse(graphZhText);
  const exportedPackEnvelope = JSON.parse(exportedPackText);
  const scopedDomainText = scopedDomainResource.contents.map((content) => "text" in content ? content.text : "").join("\n");
  const governanceText = requireSuccess("run_governance_checks", governance);
  const linkText = requireSuccess("link_assets", link);

  if (!tools.tools.some((tool) => tool.name === "search_design_assets")) throw new Error("search_design_assets tool missing");
  if (!tools.tools.some((tool) => tool.name === "upsert_design_asset")) throw new Error("upsert_design_asset tool missing");
  if (!tools.tools.some((tool) => tool.name === "upsert_proposal")) throw new Error("upsert_proposal tool missing");
  if (!tools.tools.some((tool) => tool.name === "upsert_context_pack")) throw new Error("upsert_context_pack tool missing");
  if (!resources.resources.some((resource) => resource.uri === "specforge://domains")) throw new Error("domains resource missing");
  if (!templates.resourceTemplates.some((template) => template.uriTemplate === "specforge://apis/{id}")) throw new Error("api resource template missing");
  if (!templates.resourceTemplates.some((template) => template.uriTemplate.includes("/{applicationServiceId}/{locale}/assets/{assetType}"))) throw new Error("scoped resource template missing");
  if (!prompts.prompts.some((prompt) => prompt.name === "design_feature")) throw new Error("design_feature prompt missing");
  if (!searchText.includes("proposal-specforge-self-design")) throw new Error("search did not find SpecForge self-design proposal");
  if (!packText.includes("# Agent Context Pack")) throw new Error("context pack markdown missing");
  const canonicalLabels = new Map(graphZhEnvelope.canonicalSource.graph.nodes.map((node: { logicalId?: string; id: string; label: string }) => [node.logicalId ?? node.id, node.label]));
  if (!graphZhEnvelope.graph.nodes.some((node: { logicalId?: string; id: string; label: string }) => canonicalLabels.get(node.logicalId ?? node.id) !== node.label)) throw new Error("localized graph result missing");
  if (!exportedPackText.includes(generatedPack.id)) throw new Error("generated Context Pack was not persisted for export");
  if (exportedPackEnvelope.contextPack.name === exportedPackEnvelope.canonicalSource.name) throw new Error("exported Context Pack was not localized");
  if (!scopedDomainText.includes("Canonical Source JSON")) throw new Error("scoped domain resource missing canonical source");
  if (!missingScopeFailure) throw new Error("missing scope was not rejected");
  if (!deniedScopeFailure) throw new Error("denied scope was not rejected");
  if (!governanceText.includes("results")) throw new Error("governance result missing");
  if (!linkText.includes("quality-specforge-impact-ready")) throw new Error("MCP persisted link result missing");

  console.log(
    JSON.stringify(
      {
        tools: tools.tools.length,
        resources: resources.resources.length,
        resourceTemplates: templates.resourceTemplates.length,
        prompts: prompts.prompts.length,
        searchFoundSpecForgeSelfDesign: searchText.includes("proposal-specforge-self-design"),
        generatedContextPack: packText.includes("# Agent Context Pack"),
        generatedContextPackPersisted: exportedPackText.includes(generatedPack.id),
        scopedResourceReadWorked: scopedDomainText.includes("Canonical Source JSON"),
        localizedGraphWorked: graphZhEnvelope.graph.nodes.some((node: { logicalId?: string; id: string; label: string }) => canonicalLabels.get(node.logicalId ?? node.id) !== node.label),
        missingScopeRejected: Boolean(missingScopeFailure),
        deniedScopeRejected: Boolean(deniedScopeFailure),
        governanceReturnedResults: governanceText.includes("results"),
        persistedLinkToolWorked: linkText.includes("quality-specforge-impact-ready")
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
