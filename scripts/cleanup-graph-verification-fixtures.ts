import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { huaweiArchitectureScopes } from "../packages/core/src/architecture/mock";
import type { ArchitectureScopeRef, ArchitectureScope } from "../packages/core/src/architecture/types";
import type { GraphHealthConfig } from "../deploy/graph/live-projection-config";

export const HISTORICAL_FIXTURE_IDS = [
  "specforge-graph-verification-a", "specforge-graph-verification-b", "specforge-graph-verification-c",
  "specforge-graph-verification-4029a64a45ab42f9aa2321f8d88cfc87-a", "specforge-graph-verification-4029a64a45ab42f9aa2321f8d88cfc87-b", "specforge-graph-verification-4029a64a45ab42f9aa2321f8d88cfc87-c",
  "specforge-graph-verification-cf7ddbd736d049a6a681009090b59cb9-a", "specforge-graph-verification-cf7ddbd736d049a6a681009090b59cb9-b", "specforge-graph-verification-cf7ddbd736d049a6a681009090b59cb9-c"
] as const;

export interface CleanupClient { callTool(input: { name: string; arguments: Record<string, unknown> }): Promise<{ isError?: boolean; content?: Array<{ text?: string }> }>; }
export interface CleanupScope extends ArchitectureScopeRef { applicationServiceId: string; scope?: ArchitectureScope; }

export function fixtureIds(liveRunId: string): string[] { return ["a", "b", "c"].map((suffix) => `specforge-graph-verification-${liveRunId}-${suffix}`); }

export async function cleanupRunFixtures(client: CleanupClient, config: Pick<GraphHealthConfig, "applicationServiceId" | "scopePath" | "liveRunId">): Promise<{ assetIds: string[]; status: string; remainingLinks: number }> {
  const assetIds = fixtureIds(config.liveRunId);
  const result = await callMcp(client, "delete_seed_design_data", { architectureScope: { applicationServiceId: config.applicationServiceId, scopePath: config.scopePath }, assetIds, proposalIds: [], contextPackIds: [] });
  const links = await callMcp(client, "list_asset_links", { applicationServiceId: config.applicationServiceId });
  const rows = Array.isArray(links) ? links : Array.isArray((links as Record<string, unknown>).links) ? (links as Record<string, unknown>).links : [];
  const remainingLinks = (rows as Array<Record<string, unknown>>).filter((link) => assetIds.includes(String(link.sourceId)) || assetIds.includes(String(link.targetId))).length;
  if (remainingLinks !== 0) throw new Error(`GRAPH_FIXTURE_CLEANUP_READBACK_FAILED:${remainingLinks}`);
  return { assetIds, status: String((result as Record<string, unknown>).status ?? "deleted"), remainingLinks };
}

export function validateHistoricalFixture(asset: Record<string, unknown>, links: readonly Record<string, unknown>[]): void {
  const id = String(asset.id ?? "");
  const description = String(asset.description ?? "");
  if (!HISTORICAL_FIXTURE_IDS.includes(id as typeof HISTORICAL_FIXTURE_IDS[number]) || String(asset.type ?? "api") !== "api" || !String(asset.path ?? "").startsWith("/internal/specforge-graph-verification/") || asset.domainId !== "domain-graph-verification" || !description.includes("Ephemeral exact-Scope API fixture")) throw new Error(`GRAPH_FIXTURE_FINGERPRINT_MISMATCH:${id}`);
  for (const link of links) {
    const sourceId = String(link.sourceId ?? "");
    const targetId = String(link.targetId ?? "");
    if ((sourceId === id || targetId === id) && (String(link.relationType).toUpperCase() !== "CALLS" || !HISTORICAL_FIXTURE_IDS.includes((sourceId === id ? targetId : sourceId) as typeof HISTORICAL_FIXTURE_IDS[number]))) throw new Error(`GRAPH_FIXTURE_FINGERPRINT_MISMATCH:${id}:link`);
  }
}

export async function cleanupHistoricalFixtures(client: CleanupClient, scope: ArchitectureScopeRef): Promise<{ validated: number; deleted: string[]; alreadyAbsent: string[] }> {
  const linksResult = await callMcp(client, "list_asset_links", { applicationServiceId: scope.applicationServiceId });
  const links = (Array.isArray(linksResult) ? linksResult : (linksResult as Record<string, unknown>).links ?? []) as Array<Record<string, unknown>>;
  const present: string[] = [];
  const alreadyAbsent: string[] = [];
  for (const id of HISTORICAL_FIXTURE_IDS) {
    const result = await rawMcp(client, "get_asset_detail", { assetType: "api", assetId: id, ...scope, format: "json", locale: "en" });
    if (result.isError) { alreadyAbsent.push(id); continue; }
    const payload = parseMcp(result);
    const asset = (payload.asset ?? payload) as Record<string, unknown>;
    validateHistoricalFixture({ ...asset, type: "api", id }, links);
    present.push(id);
  }
  const deletion = present.length ? await callMcp(client, "delete_seed_design_data", { architectureScope: scope, assetIds: present, proposalIds: [], contextPackIds: [] }) : undefined;
  return { validated: present.length, deleted: deletion ? present : [], alreadyAbsent };
}

async function callMcp(client: CleanupClient, name: string, arguments_: Record<string, unknown>): Promise<Record<string, unknown>> { const result = await rawMcp(client, name, arguments_); if (result.isError) throw new Error(`GRAPH_FIXTURE_MCP_FAILED:${name}`); return parseMcp(result); }
async function rawMcp(client: CleanupClient, name: string, arguments_: Record<string, unknown>) { return await client.callTool({ name, arguments: arguments_ }); }
function parseMcp(result: { content?: Array<{ text?: string }> }): Record<string, unknown> { const raw = (result.content ?? []).map((item) => item.text ?? "").join(""); return raw ? JSON.parse(raw) as Record<string, unknown> : {}; }

async function cli(): Promise<void> {
  const phase = arg("phase");
  const applicationServiceId = arg("application-service");
  const scopePath = arg("scope-path");
  if (phase !== "dry-run" && phase !== "delete") throw new Error("GRAPH_FIXTURE_CLEANUP_PHASE_REQUIRED");
  if (!applicationServiceId || !scopePath) throw new Error("GRAPH_FIXTURE_CLEANUP_SCOPE_REQUIRED");
  const scope = huaweiArchitectureScopes.find((item) => item.id === applicationServiceId);
  if (!scope || scope.purpose === "verification" || scope.scopePath !== scopePath) throw new Error("GRAPH_FIXTURE_CLEANUP_SCOPE_INVALID");
  const requireFromMcp = createRequire(resolve(process.cwd(), "apps/mcp-server/package.json"));
  const { Client } = requireFromMcp("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = requireFromMcp("@modelcontextprotocol/sdk/client/stdio.js");
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve(process.cwd(), "apps/mcp-server/node_modules/tsx/dist/cli.mjs"), resolve(process.cwd(), "apps/mcp-server/src/index.ts")], cwd: process.cwd(), env: { ...process.env, SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: applicationServiceId } });
  const client = new Client({ name: "graph-verification-historical-cleanup", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  try { const result = phase === "dry-run" ? await cleanupHistoricalFixturesDryRun(client, { applicationServiceId, scopePath }) : await cleanupHistoricalFixtures(client, { applicationServiceId, scopePath }); console.log(JSON.stringify({ phase, architectureScope: { applicationServiceId, scopePath }, ...result }, null, 2)); } finally { await client.close(); await transport.close(); }
}

async function cleanupHistoricalFixturesDryRun(client: CleanupClient, scope: ArchitectureScopeRef) { const linksResult = await callMcp(client, "list_asset_links", { applicationServiceId: scope.applicationServiceId }); const links = (Array.isArray(linksResult) ? linksResult : (linksResult as Record<string, unknown>).links ?? []) as Array<Record<string, unknown>>; const matches: string[] = []; const absent: string[] = []; for (const id of HISTORICAL_FIXTURE_IDS) { const result = await rawMcp(client, "get_asset_detail", { assetType: "api", assetId: id, ...scope, format: "json", locale: "en" }); if (result.isError) { absent.push(id); continue; } const payload = parseMcp(result); validateHistoricalFixture({ ...(payload.asset ?? payload) as Record<string, unknown>, type: "api", id }, links); matches.push(id); } return { fingerprintMatches: matches, alreadyAbsent: absent, validated: matches.length }; }
function arg(name: string): string | undefined { const index = process.argv.indexOf(`--${name}`); return index < 0 ? undefined : process.argv[index + 1]; }

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) void cli().catch((error) => { console.error(error); process.exitCode = 1; });
