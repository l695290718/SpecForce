import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function firstText(result: unknown): string {
  if (!result || typeof result !== "object" || !("content" in result)) return "";
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  const first = content[0];
  return first && typeof first === "object" && "type" in first && first.type === "text" && "text" in first ? String(first.text) : "";
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
    arguments: { query: "SpecForge MCP", limit: 5 }
  });
  const contextPack = await client.callTool({
    name: "generate_context_pack",
    arguments: { proposalId: "proposal-specforge-self-design", targetAgent: "codex", format: "markdown" }
  });
  const contextPackJson = await client.callTool({
    name: "generate_context_pack",
    arguments: { proposalId: "proposal-specforge-self-design", targetAgent: "codex", format: "json" }
  });
  const governance = await client.callTool({
    name: "run_governance_checks",
    arguments: { targetType: "proposal", targetId: "proposal-specforge-self-design" }
  });
  const generatedPack = JSON.parse(firstText(contextPackJson));
  const upsert = await client.callTool({
    name: "upsert_context_pack",
    arguments: {
      contextPack: generatedPack
    }
  });

  await client.close();

  const searchText = firstText(search);
  const packText = firstText(contextPack);
  const governanceText = firstText(governance);
  const upsertText = firstText(upsert);

  if (!tools.tools.some((tool) => tool.name === "search_design_assets")) throw new Error("search_design_assets tool missing");
  if (!tools.tools.some((tool) => tool.name === "upsert_design_asset")) throw new Error("upsert_design_asset tool missing");
  if (!tools.tools.some((tool) => tool.name === "upsert_proposal")) throw new Error("upsert_proposal tool missing");
  if (!tools.tools.some((tool) => tool.name === "upsert_context_pack")) throw new Error("upsert_context_pack tool missing");
  if (!resources.resources.some((resource) => resource.uri === "specforge://domains")) throw new Error("domains resource missing");
  if (!templates.resourceTemplates.some((template) => template.uriTemplate === "specforge://apis/{id}")) throw new Error("api resource template missing");
  if (!prompts.prompts.some((prompt) => prompt.name === "design_feature")) throw new Error("design_feature prompt missing");
  if (!searchText.includes("proposal-specforge-self-design")) throw new Error("search did not find SpecForge self-design proposal");
  if (!packText.includes("# Agent Context Pack")) throw new Error("context pack markdown missing");
  if (!governanceText.includes("results")) throw new Error("governance result missing");
  if (!upsertText.includes("ctx-specforge-self-design")) throw new Error("MCP persisted write result missing");

  console.log(
    JSON.stringify(
      {
        tools: tools.tools.length,
        resources: resources.resources.length,
        resourceTemplates: templates.resourceTemplates.length,
        prompts: prompts.prompts.length,
        searchFoundSpecForgeSelfDesign: searchText.includes("proposal-specforge-self-design"),
        generatedContextPack: packText.includes("# Agent Context Pack"),
        governanceReturnedResults: governanceText.includes("results"),
        persistedWriteToolWorked: upsertText.includes("ctx-specforge-self-design")
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
