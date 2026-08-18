import { createRequire } from "node:module";
import { resolve } from "node:path";

type JsonRecord = Record<string, unknown>;
type McpResponse = { content?: Array<{ type?: string; text?: string }>; isError?: boolean };

const root = process.cwd();
const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const generationId = "coverage-generation:designer:3a:v11";
const requireFromMcp = createRequire(resolve(root, "apps/mcp-server/package.json"));
const { Client } = requireFromMcp("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = requireFromMcp("@modelcontextprotocol/sdk/client/stdio.js");

function text(result: McpResponse): string { return result.content?.map((item) => item.type === "text" ? item.text ?? "" : "").join("") ?? ""; }
function json(result: McpResponse): JsonRecord { return JSON.parse(text(result)) as JsonRecord; }
function rows(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : []; }

async function main(): Promise<void> {
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve(root, "apps/mcp-server/node_modules/tsx/dist/cli.mjs"), resolve(root, "apps/mcp-server/src/index.ts")], cwd: root, env: { ...process.env, SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: scope.applicationServiceId }, stderr: "inherit" });
  const client = new Client({ name: "enterprise-3a-coverage-verifier", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    const allRows: JsonRecord[] = [];
    let cursor: string | undefined;
    let manifest: JsonRecord | undefined;
    let freshness: unknown;
    do {
      const response = await client.callTool({ name: "get_3a_coverage_report", arguments: { architectureScope: scope, generationId, limit: 200, ...(cursor ? { cursor } : {}) } }) as McpResponse;
      if (response.isError) throw new Error(`get_3a_coverage_report: ${text(response)}`);
      const page = json(response);
      if (page.applicationServiceId !== scope.applicationServiceId || page.scopePath !== scope.scopePath) throw new Error("COVERAGE_SCOPE_MISMATCH");
      freshness = page.freshness;
      if (page.manifest && typeof page.manifest === "object") manifest = page.manifest as JsonRecord;
      allRows.push(...rows(page.rows));
      cursor = typeof page.nextCursor === "string" ? page.nextCursor : undefined;
    } while (cursor);

    if (!manifest || freshness !== "CURRENT") throw new Error(`COVERAGE_NOT_CURRENT:${JSON.stringify({ manifest, freshness })}`);
    const expectedRowCount = Number(manifest.rowCount);
    const coveredCount = allRows.filter((row) => row.status === "COVERED").length;
    const blockedCount = allRows.filter((row) => row.status === "BLOCKED").length;
    const notEvaluatedCount = allRows.filter((row) => row.status === "NOT_EVALUATED").length;
    const reasonCounts = allRows.reduce<Record<string, number>>((counts, row) => { const reason = typeof row.reasonCode === "string" ? row.reasonCode : "NONE"; counts[reason] = (counts[reason] ?? 0) + 1; return counts; }, {});
    const overBoundedPaths = allRows.filter((row) => Array.isArray(row.pathEvidence) && row.pathEvidence.length > 3).map((row) => `${String(row.assetType)}:${String(row.assetId)}`);
    const missingDigests = allRows.filter((row) => typeof row.rowDigest !== "string" || typeof row.sourceDigest !== "string").map((row) => `${String(row.assetType)}:${String(row.assetId)}`);
    if (allRows.length !== expectedRowCount || coveredCount !== Number(manifest.coveredCount) || blockedCount !== Number(manifest.blockedCount) || notEvaluatedCount !== Number(manifest.notEvaluatedCount)) throw new Error(`COVERAGE_COUNT_MISMATCH:${JSON.stringify({ rows: allRows.length, expectedRowCount, coveredCount, blockedCount, notEvaluatedCount, manifest })}`);
    if (overBoundedPaths.length || missingDigests.length) throw new Error(`COVERAGE_INVARIANT_MISMATCH:${JSON.stringify({ overBoundedPaths, missingDigests })}`);
    console.log(JSON.stringify({ scope, generationId, freshness, manifest, rows: allRows.length, coveredCount, blockedCount, notEvaluatedCount, reasonCounts, maxPathHops: Math.max(0, ...allRows.map((row) => Array.isArray(row.pathEvidence) ? row.pathEvidence.length : 0)) }, null, 2));
  } finally {
    await client.close();
    await transport.close();
  }
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
