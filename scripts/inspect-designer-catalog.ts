import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const databaseUrl = readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/u).find((line) => line.startsWith("DATABASE_URL="))?.slice(13).trim().replaceAll('"', "");
const requireFromMcp = createRequire(resolve(root, "apps/mcp-server/package.json"));
const { Client } = requireFromMcp("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = requireFromMcp("@modelcontextprotocol/sdk/client/stdio.js");
const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const transport = new StdioClientTransport({ command: process.execPath, args: [resolve(root, "apps/mcp-server/node_modules/tsx/dist/cli.mjs"), resolve(root, "apps/mcp-server/src/index.ts")], cwd: root, env: { ...process.env, SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: scope.applicationServiceId, DATABASE_URL: databaseUrl } });
const client = new Client({ name: "designer-catalog-reader", version: "0.1.0" }, { capabilities: {} });

function text(result: { content?: Array<{ type?: string; text?: string }> }): string {
  return result.content?.map((item) => item.type === "text" ? item.text ?? "" : "").join("") ?? "";
}

async function main(): Promise<void> {
  await client.connect(transport);
  try {
    const result: Record<string, unknown> = {};
    const selected = new Set([
      "api-specforge-mcp-tools", "api-specforge-3a-architecture-query", "api-specforge-3a-projection-build", "api-specforge-knowledge-baseline-publication", "api-specforge-scanner-release-contract", "api-specforge-asset-upsert", "api-specforge-proposal-upsert", "api-specforge-context-pack-upsert",
      "data-specforge-assets", "data-specforge-3a-projection-read-model", "data-specforge-asset-graph", "data-specforge-audit", "data-specforge-mcp-registry", "data-specforge-ai-generation", "data-specforge-web-workspace", "data-specforge-i18n", "data-specforge-scan-session", "data-specforge-scan-batch", "data-specforge-source-observation-v2",
      "event-specforge-governance-check-completed", "event-specforge-context-pack-generated", "rule-specforge-3a-projection-publication", "rule-specforge-knowledge-promotion-transaction", "rule-specforge-knowledge-risk-policy", "rule-specforge-core-service-reuse", "rule-bilingual-asset-completeness",
      "domain-specforge-platform", "adr-3a-architecture-navigation-workspace", "adr-postgresql-authoritative-design-store"
    ]);
    for (const assetType of ["domain", "api", "event", "dataModel", "businessRule", "stateMachine", "adr", "proposal"]) {
      const response = await client.callTool({ name: "search_design_assets", arguments: { ...scope, query: "", assetTypes: [assetType], limit: 50, locale: "en" } });
      const catalog = JSON.parse(text(response)) as { results?: Array<Record<string, unknown>> };
      result[assetType] = { results: (catalog.results ?? []).filter((item) => selected.has(String(item.id))) };
    }
    const links = await client.callTool({ name: "list_asset_links", arguments: { applicationServiceId: scope.applicationServiceId } });
  const linkCatalog = JSON.parse(text(links)) as { links?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
  const linkRows = Array.isArray(linkCatalog) ? linkCatalog : linkCatalog.links ?? [];
    result.links = linkRows
      .filter((link) => selected.has(String(link.sourceId)) || selected.has(String(link.targetId)))
      .map((link) => ({
        id: link.id,
        sourceId: link.sourceId,
        targetId: link.targetId,
        relationType: link.relationType,
        sourceType: link.sourceType,
        targetType: link.targetType,
        sourceReference: link.sourceReference
      }));
    const compact = Object.fromEntries(Object.entries(result).map(([key, value]) => {
      if (key === "links") return [key, value];
      const rows = (value as { results?: Array<Record<string, unknown>> }).results ?? [];
      return [key, rows.map((row) => ({ id: row.id, name: row.name, summary: row.summary }))];
    }));
    console.log(JSON.stringify(compact, null, 2));
  } finally {
    await client.close();
    await transport.close();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
