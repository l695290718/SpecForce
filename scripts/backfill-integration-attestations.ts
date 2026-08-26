import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { scopeById } from "@specforge/core";
import { ensureMcpPersistenceSchema, prisma } from "../apps/mcp-server/src/persistence";

type JsonRecord = Record<string, unknown>;
type McpResponse = { content?: Array<{ type?: string; text?: string }>; isError?: boolean };
type McpClientLike = { callTool(input: { name: string; arguments: JsonRecord }): Promise<McpResponse>; close(): Promise<void> };

export interface BackfillScope {
  applicationServiceId: string;
  scopePath: string;
}

export interface BackfillLink {
  id: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relationType: string;
  description?: string;
  architectureScope?: BackfillScope;
}

export interface BackfillOptions {
  scope: BackfillScope;
  mode: "dry-run" | "apply";
  batchSize: number;
}

export interface BackfillReport {
  architectureScope: BackfillScope;
  mode: BackfillOptions["mode"];
  scanned: number;
  eligible: number;
  upserted: number;
  noOp: number;
  failed: number;
  parity: "COMPLETE" | "INCOMPLETE" | "NOT_RUN";
  failures: Array<{ id: string; reason: string }>;
}

interface BackfillDependencies {
  listLinks(): Promise<BackfillLink[]>;
  writeLink(link: BackfillLink): Promise<void>;
  listCanonical(ids: string[]): Promise<Set<string>>;
}

export function filterEligibleLinks(links: BackfillLink[], scope: BackfillScope): BackfillLink[] {
  return links.filter((link) => {
    const linkScope = link.architectureScope;
    return linkScope?.applicationServiceId === scope.applicationServiceId
      && linkScope.scopePath === scope.scopePath
      && link.sourceType.trim().toLowerCase() === "evidence"
      && link.targetType.trim().toLowerCase() === "integration"
      && link.relationType.trim().toUpperCase() === "VALIDATES";
  });
}

export async function runAttestationBackfill(options: BackfillOptions, dependencies: BackfillDependencies): Promise<BackfillReport> {
  const links = await dependencies.listLinks();
  const eligible = filterEligibleLinks(links, options.scope);
  const report: BackfillReport = {
    architectureScope: options.scope,
    mode: options.mode,
    scanned: links.length,
    eligible: eligible.length,
    upserted: 0,
    noOp: 0,
    failed: 0,
    parity: options.mode === "dry-run" ? "NOT_RUN" : "INCOMPLETE",
    failures: []
  };
  if (options.mode === "dry-run" || eligible.length === 0) {
    if (options.mode === "apply") report.parity = "COMPLETE";
    return report;
  }

  const ids = eligible.map((link) => link.id);
  const before = await dependencies.listCanonical(ids);
  report.noOp = eligible.filter((link) => before.has(link.id)).length;
  const batchSize = Math.max(1, Math.min(500, Math.floor(options.batchSize) || 500));
  const failedIds = new Set<string>();

  for (let offset = 0; offset < eligible.length; offset += batchSize) {
    const batch = eligible.slice(offset, offset + batchSize);
    for (const link of batch) {
      try {
        await dependencies.writeLink(link);
        if (!before.has(link.id)) report.upserted += 1;
      } catch (error) {
        failedIds.add(link.id);
        report.failures.push({ id: link.id, reason: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  const after = await dependencies.listCanonical(ids);
  for (const link of eligible) {
    if (!after.has(link.id) && !failedIds.has(link.id)) report.failures.push({ id: link.id, reason: "CANONICAL_RELATIONSHIP_MISSING" });
  }
  report.failed = report.failures.length;
  report.parity = report.failed === 0 ? "COMPLETE" : "INCOMPLETE";
  return report;
}

function text(result: McpResponse): string {
  return result.content?.map((item) => item.type === "text" ? item.text ?? "" : "").join("") ?? "";
}

function json<T>(result: McpResponse): T {
  return JSON.parse(text(result)) as T;
}

function requiredArg(args: Map<string, string>, name: string): string {
  const value = args.get(name)?.trim();
  if (!value) throw new Error(`Missing required argument: ${name}`);
  return value;
}

export function parseBackfillArgs(argv: readonly string[]): BackfillOptions {
  const args = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key?.startsWith("--")) throw new Error(`Unexpected argument: ${key ?? ""}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for argument: ${key}`);
    args.set(key.slice(2), value);
    index += 1;
  }
  const mode = args.get("mode") ?? "dry-run";
  if (mode !== "dry-run" && mode !== "apply") throw new Error(`Invalid mode: ${mode}`);
  const batchSize = Number(args.get("batch-size") ?? "500");
  if (!Number.isFinite(batchSize) || batchSize < 1) throw new Error("batch-size must be a positive number");
  return {
    scope: { applicationServiceId: requiredArg(args, "application-service"), scopePath: requiredArg(args, "scope-path") },
    mode,
    batchSize
  };
}

function configuredEnterpriseId(): string {
  return process.env.SPECFORGE_ENTERPRISE_ID?.trim() || "legacy-enterprise";
}

async function canonicalIds(scope: BackfillScope, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await prisma.relationshipCurrent.findMany({
    where: {
      enterpriseId: configuredEnterpriseId(),
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath,
      source: "legacy-asset-link",
      relationType: "VALIDATES",
      lifecycleStatus: "ACTIVE",
      sourceReference: { in: ids.map((id) => `legacy-asset-link:${id}`) }
    },
    select: { sourceReference: true }
  });
  return new Set(rows.map((row) => row.sourceReference.replace(/^legacy-asset-link:/, "")));
}

async function createMcpClient(scope: BackfillScope): Promise<{ client: McpClientLike; close(): Promise<void> }> {
  const root = process.cwd();
  const requireFromMcp = createRequire(resolve(root, "apps/mcp-server/package.json"));
  const { Client } = requireFromMcp("@modelcontextprotocol/sdk/client/index.js") as { Client: new (info: JsonRecord, capabilities: JsonRecord) => McpClientLike & { connect(transport: unknown): Promise<void> } };
  const { StdioClientTransport } = requireFromMcp("@modelcontextprotocol/sdk/client/stdio.js") as { StdioClientTransport: new (options: JsonRecord) => { close(): Promise<void> } };
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(root, "apps/mcp-server/node_modules/tsx/dist/cli.mjs"), resolve(root, "apps/mcp-server/src/index.ts")],
    cwd: root,
    env: { ...process.env, SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: scope.applicationServiceId },
    stderr: "inherit"
  });
  const client = new Client({ name: "integration-attestation-backfill", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  return { client, close: async () => { await client.close(); await transport.close(); } };
}

async function main(): Promise<void> {
  const options = parseBackfillArgs(process.argv.slice(2));
  const registered = scopeById(options.scope.applicationServiceId);
  if (!registered || registered.level !== "applicationService" || registered.scopePath !== options.scope.scopePath) throw new Error("BACKFILL_SCOPE_MISMATCH");
  await ensureMcpPersistenceSchema();
  const connection = await createMcpClient(options.scope);
  try {
    const report = await runAttestationBackfill(options, {
      listLinks: async () => {
        const result = await connection.client.callTool({ name: "list_asset_links", arguments: { applicationServiceId: options.scope.applicationServiceId } });
        if (result.isError) throw new Error(`list_asset_links failed: ${text(result)}`);
        return json<BackfillLink[]>(result);
      },
      writeLink: async (link) => {
        const result = await connection.client.callTool({ name: "link_assets", arguments: {
          sourceType: link.sourceType,
          sourceId: link.sourceId,
          targetType: link.targetType,
          targetId: link.targetId,
          relationType: "VALIDATES",
          ...(link.description ? { description: link.description } : {}),
          architectureScope: options.scope
        } });
        if (result.isError) throw new Error(`link_assets failed: ${text(result)}`);
      },
      listCanonical: (ids) => canonicalIds(options.scope, ids)
    });
    console.log(JSON.stringify(report, null, 2));
    if (report.failed > 0 || (options.mode === "apply" && report.parity !== "COMPLETE")) process.exitCode = 1;
  } finally {
    await connection.close();
    await prisma.$disconnect();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
