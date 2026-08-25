import { writeFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { compileGovernanceBriefing, renderGovernanceBriefingMarkdown, type BriefingAssetInput } from "@specforge/core";

type AnyRecord = Record<string, any>;

const SCOPES: Record<string, string> = {
  "com.huawei.celon.desiner": "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner",
  "com.huawei.celon.integrationgateway": "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.integrationgateway",
  "com.huawei.celon.specstudio": "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.specstudio",
  "com.huawei.celon.policyhub": "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.policyhub"
};

async function callTool(client: Client, name: string, toolArgs: AnyRecord): Promise<AnyRecord> {
  const result = await client.callTool({ name, arguments: toolArgs });
  if (result.isError) throw new Error(result.content?.map((item) => ("text" in item ? item.text : "")).join("") || `${name} failed`);
  const text = result.content?.map((item) => ("text" in item ? item.text : "")).filter(Boolean).join("");
  return text ? (JSON.parse(text) as AnyRecord) : {};
}

async function searchAll(client: Client, assetType: string): Promise<BriefingAssetInput[]> {
  const collected = new Map<string, BriefingAssetInput>();
  for (const [applicationServiceId, scopePath] of Object.entries(SCOPES)) {
    const page = await callTool(client, "search_design_assets", { query: "", applicationServiceId, assetTypes: [assetType], limit: 50, locale: "en" });
    for (const item of (page.results ?? []) as AnyRecord[]) {
      if (!collected.has(item.id)) collected.set(item.id, { id: item.id, name: item.name ?? item.id, description: item.summary ?? "", status: item.status });
    }
  }
  return [...collected.values()];
}

async function main(): Promise<void> {
  const transport = new StdioClientTransport({ command: process.execPath, args: ["apps/mcp-server/node_modules/tsx/dist/cli.mjs", "apps/mcp-server/src/index.ts"], cwd: process.cwd(), env: { ...process.env, CI: process.env.CI ?? "true", SPECFORGE_MCP_SEED: "0" } });
  const client = new Client({ name: "specforge-governance-briefing", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    // Status lives on the detail payload; summaries may omit it. Fetch details for ADRs in the primary scope.
    const adrs = await searchAll(client, "adr");
    const withStatus: BriefingAssetInput[] = [];
    for (const adr of adrs) {
      try {
        const detail = await callTool(client, "get_asset_detail", { architectureScope: { applicationServiceId: "com.huawei.celon.desiner", scopePath: SCOPES["com.huawei.celon.desiner"] }, assetType: "adr", assetId: adr.id });
        const payload = (detail.asset ?? detail) as AnyRecord;
        withStatus.push({ ...adr, status: payload.status ?? payload.payload?.status ?? adr.status ?? "accepted" });
      } catch {
        withStatus.push({ ...adr, status: adr.status ?? "accepted" });
      }
    }
    const rules = await searchAll(client, "businessRule");
    const briefing = compileGovernanceBriefing({ rules, adrs: withStatus });
    const markdown = renderGovernanceBriefingMarkdown(briefing, new Date().toISOString());
    writeFileSync("docs/governance-briefing.md", markdown, "utf8");
    console.log(JSON.stringify({ digest: briefing.digest, rules: briefing.counts.rules, adrsAccepted: briefing.counts.adrsAccepted, adrsOther: briefing.counts.adrsOther }));
  } finally {
    await client.close();
    await transport.close();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
