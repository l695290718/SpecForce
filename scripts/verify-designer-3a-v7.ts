import { createRequire } from "node:module";
import { resolve } from "node:path";

type Arguments = Record<string, string>;
type JsonRecord = Record<string, unknown>;
type McpResponse = { content?: Array<{ type?: string; text?: string }>; isError?: boolean };

const root = process.cwd();
const scope = {
  applicationServiceId: process.env.SPECFORGE_APPLICATION_SERVICE_ID ?? "com.huawei.celon.desiner",
  scopePath:
    process.env.SPECFORGE_SCOPE_PATH ??
    "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

function parseArguments(values: string[]): Arguments {
  const result: Arguments = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value?.startsWith("--")) throw new Error(`Unsupported argument: ${value ?? "<missing>"}`);
    const name = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${name}`);
    result[name] = next;
    index += 1;
  }
  return result;
}

function required(args: Arguments, name: string): string {
  const value = args[name]?.trim();
  if (!value) throw new Error(`Missing required option --${name}`);
  return value;
}

function text(result: McpResponse): string {
  return result.content?.map((item) => (item.type === "text" ? (item.text ?? "") : "")).join("") ?? "";
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2).filter((value) => value !== "--"));
  const requireFromMcp = createRequire(resolve(root, "apps/mcp-server/package.json"));
  const { Client } = requireFromMcp("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = requireFromMcp("@modelcontextprotocol/sdk/client/stdio.js");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      resolve(root, "apps/mcp-server/node_modules/tsx/dist/cli.mjs"),
      resolve(root, "apps/mcp-server/src/index.ts")
    ],
    cwd: root,
    env: { ...process.env, SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: scope.applicationServiceId }
  });
  const client = new Client({ name: "designer-3a-v7-verifier", version: "0.1.0" }, { capabilities: {} });
  const call = async (name: string, arguments_: JsonRecord): Promise<JsonRecord> => {
    const response = (await client.callTool({ name, arguments: arguments_ })) as McpResponse;
    const raw = text(response);
    if (response.isError) throw new Error(`${name}: ${raw}`);
    return raw ? (JSON.parse(raw) as JsonRecord) : {};
  };
  await client.connect(transport);
  try {
    const candidate = await call("get_3a_architecture_candidate_set", {
      architectureScope: scope,
      candidateSetId: required(args, "candidate-set")
    });
    if (candidate.status !== "PROMOTED")
      throw new Error(`THREE_A_V7_CANDIDATE_NOT_PROMOTED:${String(candidate.status)}`);
    const manifestsResult = await call("list_3a_projection_manifests", {
      architectureScope: scope,
      baselineId: required(args, "baseline")
    });
    const manifests = Array.isArray(manifestsResult)
      ? manifestsResult
      : ((manifestsResult.manifests as JsonRecord[] | undefined) ?? []);
    const manifest =
      manifests.find((item) => item.baselineId === args.baseline && item.publishedAt) ??
      manifests.find((item) => item.publishedAt);
    if (!manifest?.id) throw new Error("THREE_A_V7_PROJECTION_MANIFEST_NOT_FOUND");
    const map = await call("search_3a_architecture_map", {
      architectureScope: scope,
      baselineId: required(args, "baseline"),
      projectionManifestId: String(manifest.id),
      filters: { includeUnclassified: true },
      budget: { maxUnitsPerLayer: 100, maxMappings: 500, timeoutMs: 5_000, maxPayloadBytes: 2_000_000 }
    });
    const units = Array.isArray(map.units) ? map.units : [];
    const mappings = Array.isArray(map.mappings) ? map.mappings : [];
    const totalByLayer = (map.totalByLayer ?? {}) as JsonRecord;
    const identity = (map.identity ?? {}) as JsonRecord;
    const scopeMatches =
      identity.applicationServiceId === scope.applicationServiceId && identity.scopePath === scope.scopePath;
    if (
      map.status !== "READY" ||
      !scopeMatches ||
      units.length === 0 ||
      mappings.length === 0 ||
      Number(map.unclassifiedCount ?? -1) !== 0 ||
      Number(totalByLayer.BIZ ?? 0) > 6 ||
      Number(totalByLayer.SYS ?? 0) > 12 ||
      Number(totalByLayer.TECH ?? 0) > 5
    )
      throw new Error(
        `THREE_A_V7_MAP_READBACK_MISMATCH:${JSON.stringify({ status: map.status, scopeMatches, units: units.length, mappings: mappings.length, totalByLayer, unclassifiedCount: map.unclassifiedCount })}`
      );
    const result: JsonRecord = {
      scope,
      candidateSetId: candidate.id,
      candidateStatus: candidate.status,
      baselineId: args.baseline,
      projectionManifestId: manifest.id,
      mapStatus: map.status,
      units: units.length,
      mappings: mappings.length,
      totalByLayer,
      unclassifiedCount: map.unclassifiedCount
    };
    if (args["v6-baseline"]) {
      const v6ManifestsResult = await call("list_3a_projection_manifests", {
        architectureScope: scope,
        baselineId: args["v6-baseline"]
      });
      const v6Manifests = Array.isArray(v6ManifestsResult)
        ? v6ManifestsResult
        : ((v6ManifestsResult.manifests as JsonRecord[] | undefined) ?? []);
      const v6Manifest = v6Manifests.find((item) => item.publishedAt);
      if (!v6Manifest?.id) throw new Error("THREE_A_V6_PROJECTION_MANIFEST_NOT_FOUND");
      const v6Map = await call("search_3a_architecture_map", {
        architectureScope: scope,
        baselineId: args["v6-baseline"],
        projectionManifestId: String(v6Manifest.id),
        filters: { includeUnclassified: true },
        budget: { maxUnitsPerLayer: 100, maxMappings: 100, timeoutMs: 5_000, maxPayloadBytes: 1_000_000 }
      });
      const v6Units = Array.isArray(v6Map.units) ? v6Map.units : [];
      const v6Mappings = Array.isArray(v6Map.mappings) ? v6Map.mappings : [];
      if (v6Map.status !== "READY" || v6Units.length !== 8 || v6Mappings.length !== 6)
        throw new Error(
          `THREE_A_V6_REGRESSION_MISMATCH:${JSON.stringify({ status: v6Map.status, units: v6Units.length, mappings: v6Mappings.length })}`
        );
      result.v6Regression = { status: v6Map.status, units: v6Units.length, mappings: v6Mappings.length };
    }
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.close();
    await transport.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
