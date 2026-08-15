import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const databaseUrl = readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/u).find((line) => line.startsWith("DATABASE_URL="))?.slice(13).trim().replaceAll('"', "");
const requireFromMcp = createRequire(resolve(root, "apps/mcp-server/package.json"));
const { Client } = requireFromMcp("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = requireFromMcp("@modelcontextprotocol/sdk/client/stdio.js");
const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const baselineId = "knowledge-baseline:designer:3a:v3";

function text(result: { content?: Array<{ type?: string; text?: string }> }): string { return result.content?.map((item) => item.type === "text" ? item.text ?? "" : "").join("") ?? ""; }
function json(raw: string): Record<string, unknown> { return JSON.parse(raw) as Record<string, unknown>; }

async function main(): Promise<void> {
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve(root, "apps/mcp-server/node_modules/tsx/dist/cli.mjs"), resolve(root, "apps/mcp-server/src/index.ts")], cwd: root, env: { ...process.env, SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: scope.applicationServiceId, DATABASE_URL: databaseUrl } });
  const client = new Client({ name: "designer-3a-coverage-verifier", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  const call = async (name: string, arguments_: Record<string, unknown>) => {
    const response = await client.callTool({ name, arguments: arguments_ });
    const raw = text(response);
    if (response.isError) throw new Error(`${name}: ${raw}`);
    return json(raw);
  };
  try {
    const baselines = await call("list_3a_published_baselines", { architectureScope: scope });
    const manifests = await call("list_3a_projection_manifests", { architectureScope: scope, baselineId });
    const manifestRows = Array.isArray(manifests) ? manifests : (Array.isArray(manifests.manifests) ? manifests.manifests : []);
    const manifest = (manifestRows as Array<Record<string, unknown>>).find((row) => row.baselineId === baselineId && row.publishedAt) ?? manifestRows[0];
    if (!manifest) throw new Error("DESIGNER_3A_V3_MANIFEST_NOT_FOUND");
    const map = await call("search_3a_architecture_map", {
      architectureScope: scope,
      baselineId,
      projectionManifestId: String(manifest.id),
      filters: { includeUnclassified: true },
      budget: { maxUnitsPerLayer: 100, maxMappings: 100, timeoutMs: 5000, maxPayloadBytes: 1_000_000 }
    });
    const units = Array.isArray(map.units) ? map.units : [];
    const mappings = Array.isArray(map.mappings) ? map.mappings : [];
    const mapScope = (map.identity && typeof map.identity === "object" ? map.identity : map) as Record<string, unknown>;
    const scopeMatches = mapScope.applicationServiceId === scope.applicationServiceId && mapScope.scopePath === scope.scopePath;
    if (!scopeMatches || units.length !== 4 || mappings.length !== 3 || map.status !== "READY") throw new Error(`DESIGNER_3A_V3_READBACK_MISMATCH:${JSON.stringify({ scopeMatches, status: map.status, units: units.length, mappings: mappings.length })}`);
    console.log(JSON.stringify({ baselineId, projectionManifestId: manifest.id, generationId: manifest.generationId, status: map.status, units: units.length, members: units.reduce((total, unit) => total + Number((unit as Record<string, unknown>).memberCount ?? 0), 0), mappings: mappings.length, totalByLayer: map.totalByLayer, unclassifiedCount: map.unclassifiedCount, scopeMatches }, null, 2));
  } finally {
    await client.close();
    await transport.close();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
