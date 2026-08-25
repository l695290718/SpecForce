import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type AnyRecord = Record<string, any>;

const args = process.argv.slice(2);
const command = args[0];
const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const SCOPE_ID = flag("scope") ?? "com.huawei.celon.desiner";
const SCOPE_PATHS: Record<string, string> = {
  "com.huawei.celon.desiner": "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner",
  "com.huawei.celon.integrationgateway": "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.integrationgateway",
  "com.huawei.celon.specstudio": "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.specstudio",
  "com.huawei.celon.policyhub": "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.policyhub"
};
const architectureScope = { applicationServiceId: SCOPE_ID, scopePath: SCOPE_PATHS[SCOPE_ID] ?? SCOPE_PATHS["com.huawei.celon.desiner"] };

async function callTool(client: Client, name: string, toolArgs: AnyRecord): Promise<AnyRecord> {
  const result = await client.callTool({ name, arguments: toolArgs });
  if (result.isError) throw new Error(result.content?.map((item) => ("text" in item ? item.text : "")).join("") || `${name} failed`);
  const text = result.content?.map((item) => ("text" in item ? item.text : "")).filter(Boolean).join("");
  return text ? (JSON.parse(text) as AnyRecord) : {};
}

async function main(): Promise<void> {
  const transport = new StdioClientTransport({ command: process.execPath, args: ["apps/mcp-server/node_modules/tsx/dist/cli.mjs", "apps/mcp-server/src/index.ts"], cwd: process.cwd(), env: { ...process.env, CI: process.env.CI ?? "true", SPECFORGE_MCP_SEED: "0" } });
  const client = new Client({ name: "specforge-design-query", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    if (command === "search") {
      const assetTypes = flag("type") ? [flag("type")!] : undefined;
      const result = await callTool(client, "search_design_assets", {
        query: flag("q") ?? "",
        applicationServiceId: SCOPE_ID,
        ...(assetTypes ? { assetTypes } : {}),
        limit: Number(flag("limit") ?? 50),
        locale: "en"
      });
      console.log(JSON.stringify(result, null, 2));
    } else if (command === "detail") {
      const id = flag("id");
      if (!id) throw new Error("--id required");
      const result = await callTool(client, "get_asset_detail", { assetType: flag("type") ?? "adr", assetId: id, applicationServiceId: SCOPE_ID, format: "json", locale: "en" });
      console.log(JSON.stringify(result, null, 2));
    } else {
      throw new Error("usage: design-query search [--type t] [--q q] [--scope s] | detail --type t --id id [--scope s]");
    }
  } finally {
    await client.close();
    await transport.close();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
