import { createRequire } from "node:module";
import { resolve } from "node:path";

const root = process.cwd();
const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/module-celon-designer/com.huawei.celon.desiner".replace("module-celon-designer/module-celon-designer/", "module-celon-designer/") };
const v5BaselineId = "knowledge-baseline:designer:3a:v5";
const v6BaselineId = "knowledge-baseline:designer:3a:v6";
const newUnits = [
  ["unit:sys:specforge-web-console", "api-specforge-web-console"],
  ["unit:sys:specforge-ai-generation-service", "api-specforge-ai-generation"],
  ["unit:sys:specforge-asset-graph-query-service", "api-specforge-graph-query"],
  ["unit:sys:specforge-mcp-audit-observability-service", "obs-specforge-mcp-audit"]
] as const;
const excludedFixtures = ["specforge-graph-verification-a", "specforge-graph-verification-b", "specforge-graph-verification-c", "specforge-graph-verification-4029a64a45ab42f9aa2321f8d88cfc87-a", "specforge-graph-verification-4029a64a45ab42f9aa2321f8d88cfc87-b", "specforge-graph-verification-4029a64a45ab42f9aa2321f8d88cfc87-c", "specforge-graph-verification-cf7ddbd736d049a6a681009090b59cb9-a", "specforge-graph-verification-cf7ddbd736d049a6a681009090b59cb9-b", "specforge-graph-verification-cf7ddbd736d049a6a681009090b59cb9-c"];
type JsonRecord = Record<string, unknown>;
type McpResponse = { content?: Array<{ type?: string; text?: string }>; isError?: boolean };
const requireFromMcp = createRequire(resolve(root, "apps/mcp-server/package.json"));
const { Client } = requireFromMcp("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = requireFromMcp("@modelcontextprotocol/sdk/client/stdio.js");

function text(result: McpResponse): string { return result.content?.map((item) => item.type === "text" ? item.text ?? "" : "").join("") ?? ""; }
function array(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }

async function main(): Promise<void> {
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve(root, "apps/mcp-server/node_modules/tsx/dist/cli.mjs"), resolve(root, "apps/mcp-server/src/index.ts")], cwd: root, env: { ...process.env, SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: scope.applicationServiceId } });
  const client = new Client({ name: "designer-3a-v6-verifier", version: "0.1.0" }, { capabilities: {} });
  const call = async (name: string, arguments_: JsonRecord): Promise<JsonRecord> => { const response = await client.callTool({ name, arguments: arguments_ }); const raw = text(response); if (response.isError) throw new Error(`${name}: ${raw}`); return JSON.parse(raw) as JsonRecord; };
  await client.connect(transport);
  try {
    const v6Identity = await readIdentity(call, v6BaselineId);
    const v6Map = await call("search_3a_architecture_map", { architectureScope: scope, baselineId: v6BaselineId, projectionManifestId: v6Identity.projectionManifestId, filters: { includeUnclassified: true }, budget: { maxUnitsPerLayer: 100, maxMappings: 100, timeoutMs: 5_000, maxPayloadBytes: 1_000_000 } });
    const v6Units = array(v6Map.units);
    const v6Mappings = array(v6Map.mappings);
    const mapIdentity = (v6Map.identity ?? {}) as JsonRecord;
    const scopeMatches = mapIdentity.applicationServiceId === scope.applicationServiceId && mapIdentity.scopePath === scope.scopePath;
    const totalByLayer = (v6Map.totalByLayer ?? {}) as JsonRecord;
    const fixtureHits = excludedFixtures.filter((fixture) => JSON.stringify(v6Map).includes(fixture));
    if (!scopeMatches || v6Map.status !== "READY" || v6Units.length !== 8 || v6Mappings.length !== 6 || Number(totalByLayer.BIZ) !== 1 || Number(totalByLayer.SYS) !== 6 || Number(totalByLayer.TECH) !== 1 || Number(v6Map.unclassifiedCount ?? -1) !== 0 || fixtureHits.length) throw new Error(`V6_MAP_READBACK_MISMATCH:${JSON.stringify({ scopeMatches, status: v6Map.status, units: v6Units.length, mappings: v6Mappings.length, totalByLayer, unclassifiedCount: v6Map.unclassifiedCount, fixtureHits })}`);
    const neighborhoodChecks = [];
    for (const [unitIdentity, assetId] of newUnits) {
      const neighborhood = await call("get_3a_architecture_unit_neighborhood", { identity: { architectureScope: scope, generationId: String(mapIdentity.generationId), baselineId: v6BaselineId, projectionManifestId: v6Identity.projectionManifestId }, unitIdentity, direction: "both", depth: 2, budget: { maxUnitsPerLayer: 20, maxMappings: 60, timeoutMs: 2_000, maxPayloadBytes: 524_288 } });
      const members = array(neighborhood.members);
      if (neighborhood.status !== "READY" || members.length !== 1 || !JSON.stringify(members[0]).includes(assetId)) throw new Error(`V6_UNIT_NEIGHBORHOOD_MISMATCH:${unitIdentity}`);
      neighborhoodChecks.push({ unitIdentity, memberCount: members.length, memberAssetId: assetId, status: neighborhood.status });
    }
    const v5Identity = await readIdentity(call, v5BaselineId);
    const v5Map = await call("search_3a_architecture_map", { architectureScope: scope, baselineId: v5BaselineId, projectionManifestId: v5Identity.projectionManifestId, filters: { includeUnclassified: true }, budget: { maxUnitsPerLayer: 100, maxMappings: 100, timeoutMs: 5_000, maxPayloadBytes: 1_000_000 } });
    const v5Regression = { units: array(v5Map.units).length, members: array(v5Map.units).reduce((total, unit) => total + Number(unit.memberCount ?? 0), 0), mappings: array(v5Map.mappings).length };
    if (v5Regression.units !== 4 || v5Regression.members !== 38 || v5Regression.mappings !== 3) throw new Error(`V5_REGRESSION_MISMATCH:${JSON.stringify(v5Regression)}`);
    console.log(JSON.stringify({ scope, baselineId: v6BaselineId, projectionManifestId: v6Identity.projectionManifestId, generationId: mapIdentity.generationId, status: v6Map.status, units: v6Units.length, members: v6Units.reduce((total, unit) => total + Number(unit.memberCount ?? 0), 0), mappings: v6Mappings.length, totalByLayer, unclassifiedCount: v6Map.unclassifiedCount, fixtureHits, scopeMatches, neighborhoodChecks, v5Regression }, null, 2));
  } finally { await client.close(); await transport.close(); }
}

async function readIdentity(call: (name: string, arguments_: JsonRecord) => Promise<JsonRecord>, baselineId: string): Promise<{ projectionManifestId: string }> {
  const result = await call("list_3a_projection_manifests", { architectureScope: scope, baselineId });
  const manifests = Array.isArray(result) ? result : array(result.manifests);
  const manifest = manifests.find((item) => item.baselineId === baselineId && item.publishedAt) ?? manifests[0];
  if (!manifest?.id) throw new Error(`PROJECTION_MANIFEST_NOT_FOUND:${baselineId}`);
  return { projectionManifestId: String(manifest.id) };
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
