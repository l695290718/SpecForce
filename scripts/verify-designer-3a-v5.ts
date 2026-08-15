import { createRequire } from "node:module";
import { resolve } from "node:path";

const root = process.cwd();
const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const baselineId = "knowledge-baseline:designer:3a:v5";
const gatewayUnit = "unit:sys:specforge-mcp-governance-gateway";
const excludedFixtures = [
  "specforge-graph-verification-a", "specforge-graph-verification-b", "specforge-graph-verification-c",
  "specforge-graph-verification-4029a64a45ab42f9aa2321f8d88cfc87-a", "specforge-graph-verification-4029a64a45ab42f9aa2321f8d88cfc87-b", "specforge-graph-verification-4029a64a45ab42f9aa2321f8d88cfc87-c",
  "specforge-graph-verification-cf7ddbd736d049a6a681009090b59cb9-a", "specforge-graph-verification-cf7ddbd736d049a6a681009090b59cb9-b", "specforge-graph-verification-cf7ddbd736d049a6a681009090b59cb9-c"
];
const deferredAssets = ["api-specforge-ai-generation", "api-specforge-graph-query", "api-specforge-web-console", "obs-specforge-mcp-audit"];
const expectedV5Members = [
  "api-specforge-asset-link", "event-specforge-asset-link-created", "event-specforge-design-asset-upserted", "event-specforge-mcp-tool-called",
  "rule-specforge-mcp-write-audit", "rule-specforge-relationships-required", "rule-specforge-seed-through-mcp", "integration-specforge-mcp-agent",
  "sm-specforge-context-pack-generation", "sm-specforge-proposal-lifecycle"
];
const requireFromMcp = createRequire(resolve(root, "apps/mcp-server/package.json"));
const { Client } = requireFromMcp("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = requireFromMcp("@modelcontextprotocol/sdk/client/stdio.js");

type McpResponse = { content?: Array<{ type?: string; text?: string }>; isError?: boolean };
function text(result: McpResponse): string { return result.content?.map((item) => item.type === "text" ? item.text ?? "" : "").join("") ?? ""; }
function json(raw: string): Record<string, unknown> { return JSON.parse(raw) as Record<string, unknown>; }
function array(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : []; }
function memberKey(member: Record<string, unknown>): string { return `${String(member.semanticIdentity ?? "")}:${String(member.assertionId ?? "")}`; }
function sortedMembers(result: Record<string, unknown>): Record<string, unknown>[] { return array(result.members).sort((left, right) => memberKey(left).localeCompare(memberKey(right))); }

async function main(): Promise<void> {
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve(root, "apps/mcp-server/node_modules/tsx/dist/cli.mjs"), resolve(root, "apps/mcp-server/src/index.ts")], cwd: root, env: { ...process.env, SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: scope.applicationServiceId } });
  const client = new Client({ name: "designer-3a-v5-verifier", version: "0.1.0" }, { capabilities: {} });
  const call = async (name: string, arguments_: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await client.callTool({ name, arguments: arguments_ });
    const raw = text(response);
    if (response.isError) throw new Error(`${name}: ${raw}`);
    return json(raw);
  };
  await client.connect(transport);
  try {
    const baselines = await call("list_3a_published_baselines", { architectureScope: scope });
    const baselineRows = Array.isArray(baselines) ? baselines : array(baselines.baselines);
    if (!baselineRows.some((row) => row.id === baselineId && (row.status === "PUBLISHED" || row.status === "SUPERSEDED"))) throw new Error("V5_BASELINE_NOT_AVAILABLE");
    const manifests = await call("list_3a_projection_manifests", { architectureScope: scope, baselineId });
    const manifestRows = Array.isArray(manifests) ? manifests : array(manifests.manifests);
    const manifest = manifestRows.find((row) => row.baselineId === baselineId && row.publishedAt) ?? manifestRows[0];
    if (!manifest) throw new Error("V5_PROJECTION_MANIFEST_NOT_FOUND");
    const projectionManifestId = String(manifest.id);
    const map = await call("search_3a_architecture_map", { architectureScope: scope, baselineId, projectionManifestId, filters: { includeUnclassified: true }, budget: { maxUnitsPerLayer: 100, maxMappings: 100, timeoutMs: 5000, maxPayloadBytes: 1_000_000 } });
    const units = array(map.units);
    const mappings = array(map.mappings);
    const identity = map.identity && typeof map.identity === "object" ? map.identity as Record<string, unknown> : {};
    const scopeMatches = identity.applicationServiceId === scope.applicationServiceId && identity.scopePath === scope.scopePath;
    if (!scopeMatches || map.status !== "READY" || units.length !== 4 || mappings.length !== 3) throw new Error(`V5_MAP_READBACK_MISMATCH:${JSON.stringify({ scopeMatches, status: map.status, units: units.length, mappings: mappings.length })}`);
    const neighborhoodInput = {
      architectureScope: scope,
      generationId: String(identity.generationId),
      baselineId,
      projectionManifestId,
      unitIdentity: gatewayUnit,
      direction: "both",
      depth: 3,
      budget: { maxUnitsPerLayer: 12, maxMappings: 60, timeoutMs: 2_000, maxPayloadBytes: 524_288 }
    };
    const directNeighborhood = await call("get_3a_architecture_unit_neighborhood", {
      identity: {
        architectureScope: scope,
        generationId: neighborhoodInput.generationId,
        baselineId,
        projectionManifestId
      },
      unitIdentity: gatewayUnit,
      direction: neighborhoodInput.direction,
      depth: neighborhoodInput.depth,
      budget: neighborhoodInput.budget
    });
    const sharedNeighborhood = await call("query_3a_architecture_unit_neighborhood", neighborhoodInput);
    const directMembers = sortedMembers(directNeighborhood);
    const sharedMembers = sortedMembers(sharedNeighborhood);
    const neighborhoodMembersEqual = JSON.stringify(directMembers.map(memberKey)) === JSON.stringify(sharedMembers.map(memberKey));
    const memberAssetIds = directMembers.map((member) => String(member.assertionId ?? member.semanticIdentity ?? ""));
    const gatewayMembers = directMembers.filter((member) => member.unitIdentity === gatewayUnit);
    const memberCount = units.reduce((total, unit) => total + Number(unit.memberCount ?? 0), 0);
    const missingExpected = expectedV5Members.filter((assetId) => !memberAssetIds.some((id) => id.includes(assetId)));
    if (directMembers.length !== 23 || sharedMembers.length !== 23 || !neighborhoodMembersEqual || memberCount !== 38 || gatewayMembers.length !== 23 || missingExpected.length || Number(map.unclassifiedCount ?? -1) !== 0) throw new Error(`V5_MEMBER_READBACK_MISMATCH:${JSON.stringify({ directMembers: directMembers.length, sharedMembers: sharedMembers.length, neighborhoodMembersEqual, memberCount, gatewayMembers: gatewayMembers.length, missingExpected, unclassifiedCount: map.unclassifiedCount })}`);
    const fixtureHits = excludedFixtures.filter((fixture) => memberAssetIds.some((id) => id.includes(fixture)));
    if (fixtureHits.length) throw new Error(`V5_EXCLUDED_FIXTURE_PRESENT:${fixtureHits.join(",")}`);
    const deferredHits = deferredAssets.filter((assetId) => memberAssetIds.some((id) => id.includes(assetId)));
    if (deferredHits.length) throw new Error(`V5_DEFERRED_ASSET_PRESENT:${deferredHits.join(",")}`);
    console.log(JSON.stringify({ scope, baselineId, projectionManifestId, generationId: identity.generationId, status: map.status, units: units.length, members: memberCount, gatewayMembers: gatewayMembers.length, directNeighborhoodStatus: directNeighborhood.status, sharedNeighborhoodStatus: sharedNeighborhood.status, directNeighborhoodMembers: directMembers.length, sharedNeighborhoodMembers: sharedMembers.length, neighborhoodMembersEqual, mappings: mappings.length, totalByLayer: map.totalByLayer, unclassifiedCount: map.unclassifiedCount, fixtureHits, deferredHits, missingExpected, scopeMatches, memberReadback: "mcp-dual-path-postgresql-derived-projection-read-only" }, null, 2));
  } finally {
    await client.close();
    await transport.close();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
