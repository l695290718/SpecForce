import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scopeById, type ArchitectureScopeRef } from "@specforge/core";
import {
  buildFeatureCatalogBackfillPlan,
  type FeatureCatalogBackfillPlan
} from "../apps/mcp-server/src/features/catalog-backfill";
import type { SystemKnowledgeAsset, SystemKnowledgeRelationship } from "../apps/mcp-server/src/knowledge-readiness/read";

type JsonRecord = Record<string, unknown>;
type McpToolResult = { content?: Array<{ type?: string; text?: string }>; isError?: boolean };
export type FeatureCatalogMcpClient = { callTool(input: { name: string; arguments: JsonRecord }): Promise<McpToolResult> };

export interface FeatureCatalogBackfillOptions {
  architectureScope: ArchitectureScopeRef;
  mode: "dry-run" | "apply";
  sessionId: string;
  pageSize: number;
  now?: string;
}

export interface FeatureCatalogBackfillReport {
  architectureScope: ArchitectureScopeRef;
  mode: FeatureCatalogBackfillOptions["mode"];
  readinessReceiptId: string;
  planDigest: string;
  assetsRead: number;
  relationshipsRead: number;
  featureAssets: number;
  featureRelationships: number;
  directMappings: number;
  indirectMappings: number;
  exceptions: FeatureCatalogBackfillPlan["exceptions"];
  artifactPath?: string;
  changeSet: unknown;
}

export interface FeatureCatalogBackfillDependencies {
  writePlan?(plan: FeatureCatalogBackfillPlan): Promise<string>;
}

const knowledgeProfile = "ARCHITECTURE_OVERVIEW";
const purpose = "Backfill exact-Scope bilingual Feature catalog from governed system knowledge.";

function resultText(result: McpToolResult): string {
  return result.content?.filter((item) => item.type === "text").map((item) => item.text ?? "").join("") ?? "";
}

function parseResult<T>(result: McpToolResult, tool: string): T {
  const message = resultText(result);
  if (result.isError) throw new Error(`${tool} failed: ${message || "MCP_TOOL_ERROR"}`);
  try {
    return JSON.parse(message) as T;
  } catch {
    throw new Error(`${tool} returned invalid JSON`);
  }
}

async function call<T>(client: FeatureCatalogMcpClient, name: string, arguments_: JsonRecord): Promise<T> {
  return parseResult<T>(await client.callTool({ name, arguments: arguments_ }), name);
}

export async function runFeatureCatalogBackfill(
  client: FeatureCatalogMcpClient,
  options: FeatureCatalogBackfillOptions,
  dependencies: FeatureCatalogBackfillDependencies = {}
): Promise<FeatureCatalogBackfillReport> {
  const readRequest = {
    architectureScope: options.architectureScope,
    knowledgeProfile,
    selectors: [],
    purpose,
    locale: "en" as const
  };
  const readiness = await call<{
    accessDecision: "ALLOW" | "DENY";
    receiptId?: string;
    reasonCodes?: string[];
    asOf?: string;
  }>(client, "evaluate_system_knowledge_readiness", readRequest);
  if (readiness.accessDecision !== "ALLOW" || !readiness.receiptId) {
    throw new Error(`FEATURE_CATALOG_READINESS_DENIED:${(readiness.reasonCodes ?? []).join(",") || "RECEIPT_MISSING"}`);
  }

  const assets: SystemKnowledgeAsset[] = [];
  const relationships: SystemKnowledgeRelationship[] = [];
  let cursor: string | undefined;
  do {
    const page = await call<{
      accessDecision: "ALLOW" | "DENY";
      assets: SystemKnowledgeAsset[];
      relationships: SystemKnowledgeRelationship[];
      nextCursor?: string;
    }>(client, "read_system_knowledge", {
      ...readRequest,
      receiptId: readiness.receiptId,
      pageSize: options.pageSize,
      ...(cursor ? { cursor } : {})
    });
    if (page.accessDecision !== "ALLOW") throw new Error("FEATURE_CATALOG_READ_DENIED");
    assets.push(...page.assets);
    relationships.push(...page.relationships);
    cursor = page.nextCursor;
  } while (cursor);

  const plan = buildFeatureCatalogBackfillPlan({
    architectureScope: options.architectureScope,
    assets,
    relationships,
    now: options.now ?? readiness.asOf ?? new Date().toISOString()
  });
  if (plan.assets.length > 100 || plan.relationships.length > 1_000) throw new Error("FEATURE_CATALOG_CHANGE_SET_BUDGET_EXCEEDED");
  if (options.mode === "apply" && plan.exceptions.some((exception) => exception.reason === "NO_EVIDENCED_INDIRECT_PATH")) {
    throw new Error("FEATURE_CATALOG_UNMAPPED_ASSETS");
  }

  const artifactPath = dependencies.writePlan ? await dependencies.writePlan(plan) : undefined;
  const idempotencyKey = `feature-catalog-backfill:${options.sessionId}:${plan.digest}`;
  const changeSet = await call<unknown>(client, "apply_feature_change_set", {
    architectureScope: options.architectureScope,
    designChangeSessionId: options.sessionId,
    correlationId: `feature-catalog-backfill:${plan.digest}`,
    idempotencyKey,
    dryRun: options.mode === "dry-run",
    assets: plan.assets,
    relationships: plan.relationships
  });

  return {
    architectureScope: options.architectureScope,
    mode: options.mode,
    readinessReceiptId: readiness.receiptId,
    planDigest: plan.digest,
    assetsRead: assets.length,
    relationshipsRead: relationships.length,
    featureAssets: plan.assets.length,
    featureRelationships: plan.relationships.length,
    directMappings: plan.directMappings.length,
    indirectMappings: plan.indirectMappings.length,
    exceptions: plan.exceptions,
    ...(artifactPath ? { artifactPath } : {}),
    changeSet
  };
}

export function parseFeatureCatalogBackfillArgs(argv: readonly string[]): FeatureCatalogBackfillOptions {
  const args = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key?.startsWith("--")) throw new Error(`Unexpected argument: ${key ?? ""}`);
    const name = key.slice(2);
    if (name === "dry-run" || name === "apply") {
      args.set(name, true);
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for argument: ${key}`);
    args.set(name, value);
    index += 1;
  }
  const applying = args.has("apply");
  if (applying && args.has("dry-run")) throw new Error("Choose only one of --dry-run or --apply");
  const applicationServiceId = stringArgument(args, "application-service");
  const scopePath = stringArgument(args, "scope-path");
  const sessionId = stringArgument(args, "session");
  const pageSize = Number(args.get("page-size") ?? "200");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) throw new Error("--page-size must be an integer between 1 and 200");
  return {
    architectureScope: { applicationServiceId, scopePath },
    mode: applying ? "apply" : "dry-run",
    sessionId,
    pageSize
  };
}

function stringArgument(args: Map<string, string | true>, name: string): string {
  const value = args.get(name);
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing required argument: --${name}`);
  return value;
}

async function writePlanArtifact(plan: FeatureCatalogBackfillPlan): Promise<string> {
  const directory = resolve(process.cwd(), ".specforge", "feature-catalog");
  const path = resolve(directory, `${plan.digest}.json`);
  await mkdir(directory, { recursive: true });
  await writeFile(path, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return path;
}

async function createMcpClient(scope: ArchitectureScopeRef): Promise<{ client: FeatureCatalogMcpClient; close(): Promise<void> }> {
  const root = process.cwd();
  const requireFromMcp = createRequire(resolve(root, "apps/mcp-server/package.json"));
  const { Client } = requireFromMcp("@modelcontextprotocol/sdk/client/index.js") as {
    Client: new (info: JsonRecord, capabilities: JsonRecord) => FeatureCatalogMcpClient & { connect(transport: unknown): Promise<void>; close(): Promise<void> };
  };
  const { StdioClientTransport } = requireFromMcp("@modelcontextprotocol/sdk/client/stdio.js") as {
    StdioClientTransport: new (options: JsonRecord) => { close(): Promise<void> };
  };
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(root, "apps/mcp-server/node_modules/tsx/dist/cli.mjs"), resolve(root, "apps/mcp-server/src/index.ts")],
    cwd: root,
    env: { ...process.env, SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: scope.applicationServiceId },
    stderr: "inherit"
  });
  const client = new Client({ name: "feature-catalog-backfill", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  return { client, close: async () => { await client.close(); await transport.close(); } };
}

async function main(): Promise<void> {
  const options = parseFeatureCatalogBackfillArgs(process.argv.slice(2).filter((argument) => argument !== "--"));
  const registered = scopeById(options.architectureScope.applicationServiceId);
  if (!registered || registered.level !== "applicationService" || registered.scopePath !== options.architectureScope.scopePath) {
    throw new Error("FEATURE_CATALOG_SCOPE_MISMATCH");
  }
  const connection = await createMcpClient(options.architectureScope);
  try {
    console.log(JSON.stringify(await runFeatureCatalogBackfill(connection.client, options, { writePlan: writePlanArtifact }), null, 2));
  } finally {
    await connection.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
