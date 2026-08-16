import { createRequire } from "node:module";
import { resolve } from "node:path";

export type ArchitectureScope = { applicationServiceId: string; scopePath: string };
export type RelationshipRepair = {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relationType: "DECIDES" | "IMPACTS";
};
export type RepairCallResult = { isError?: boolean; content?: Array<{ type?: string; text?: string }> };
export type RepairClient = { callTool(input: { name: string; arguments: Record<string, unknown> }): Promise<RepairCallResult> };

export const designerScope: ArchitectureScope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

export const enterprise3aCoverageRepairs: RelationshipRepair[] = [
  ...[
    "api-specforge-web-console",
    "api-specforge-ai-generation",
    "api-specforge-graph-query",
    "obs-specforge-mcp-audit"
  ].map((targetId) => ({ sourceType: "adr", sourceId: "adr-readable-3a-architecture-mapping-v6", targetType: targetId.startsWith("obs-") ? "observability" : "api", targetId, relationType: "DECIDES" as const })),
  ...[
    ["dataModel", "data-specforge-web-workspace"],
    ["api", "api-specforge-web-console"],
    ["businessRule", "rule-specforge-relationships-required"]
  ].map(([targetType, targetId]) => ({ sourceType: "proposal", sourceId: "proposal-agent-service-workspace", targetType, targetId, relationType: "IMPACTS" as const })),
  ...[
    ["api", "api-specforge-asset-upsert"],
    ["api", "api-specforge-proposal-upsert"],
    ["businessRule", "rule-specforge-seed-through-mcp"],
    ["quality", "quality-specforge-mcp-smoke"]
  ].map(([targetType, targetId]) => ({ sourceType: "proposal", sourceId: "proposal-mcp-native-scoped-seeding", targetType, targetId, relationType: "IMPACTS" as const }))
];

export async function repairEnterprise3aCoverageLinks(
  client: RepairClient,
  scope: ArchitectureScope = designerScope
): Promise<{ created: number; existing: number; blocked: string[] }> {
  const receipt = { created: 0, existing: 0, blocked: [] as string[] };
  for (const relationship of enterprise3aCoverageRepairs) {
    const result = await client.callTool({
      name: "link_assets",
      arguments: { ...relationship, architectureScope: scope }
    });
    if (result.isError) {
      receipt.blocked.push(`${relationship.sourceType}:${relationship.sourceId}->${relationship.relationType}->${relationship.targetType}:${relationship.targetId}`);
      continue;
    }
    const payload = parseToolPayload(result);
    const returnedScope = payload.architectureScope as ArchitectureScope | undefined;
    if (returnedScope && (returnedScope.applicationServiceId !== scope.applicationServiceId || returnedScope.scopePath !== scope.scopePath)) {
      throw new Error("RELATIONSHIP_REPAIR_SCOPE_MISMATCH");
    }
    if (payload.created === false || payload.status === "existing" || payload.status === "upserted") receipt.existing++;
    else receipt.created++;
  }
  if (receipt.blocked.length) throw new Error(`RELATIONSHIP_REPAIR_BLOCKED:${receipt.blocked.join(",")}`);
  return receipt;
}

function parseToolPayload(result: RepairCallResult): Record<string, unknown> {
  const text = (result.content ?? []).map((item) => item.type === "text" ? item.text ?? "" : "").join("");
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function connect(): Promise<{ client: RepairClient & { close(): Promise<void> }; transport: { close(): Promise<void> } }> {
  const requireFromMcp = createRequire(resolve(process.cwd(), "apps/mcp-server/package.json"));
  const { Client, StdioClientTransport } = requireFromMcp("@modelcontextprotocol/sdk/client/index.js") as typeof import("@modelcontextprotocol/sdk/client/index.js") & { StdioClientTransport: typeof import("@modelcontextprotocol/sdk/client/stdio.js").StdioClientTransport };
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(process.cwd(), "apps/mcp-server/node_modules/tsx/dist/cli.mjs"), resolve(process.cwd(), "apps/mcp-server/src/index.ts")],
    cwd: process.cwd(),
    env: { ...process.env, SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: designerScope.applicationServiceId },
    stderr: "inherit"
  });
  const client = new Client({ name: "specforge-enterprise-3a-repair", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  return { client, transport };
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll("\\", "/")}`) {
  connect().then(async ({ client, transport }) => {
    try {
      console.log(JSON.stringify(await repairEnterprise3aCoverageLinks(client), null, 2));
    } finally {
      await client.close();
      await transport.close();
    }
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
