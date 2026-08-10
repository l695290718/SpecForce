import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type Arguments = Record<string, string>;

const defaultApplicationServiceId = "com.huawei.celon.desiner";
const defaultScopePath = "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner";

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

function list(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function architectureScope(args: Arguments) {
  return {
    applicationServiceId: args["application-service"] ?? process.env.SPECFORGE_APPLICATION_SERVICE_ID ?? defaultApplicationServiceId,
    scopePath: args["scope-path"] ?? process.env.SPECFORGE_SCOPE_PATH ?? defaultScopePath
  };
}

async function callMcpTool(name: string, arguments_: Record<string, unknown>): Promise<unknown> {
  const databaseUrl = process.env.DATABASE_URL ?? await readDotEnvDatabaseUrl();
  const requestedScope = arguments_.architectureScope as { applicationServiceId?: string } | undefined;
  const requireFromMcpWorkspace = createRequire(resolve(process.cwd(), "apps/mcp-server/package.json"));
  const { Client } = requireFromMcpWorkspace("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = requireFromMcpWorkspace("@modelcontextprotocol/sdk/client/stdio.js");
  const transport = new StdioClientTransport({
    command: "pnpm",
    args: ["--filter", "@specforge/mcp-server", "dev"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      CI: process.env.CI ?? "true",
      SPECFORGE_MCP_SEED: "1",
      ...(requestedScope?.applicationServiceId ? { SPECFORGE_MCP_SEED_SCOPE: requestedScope.applicationServiceId } : {}),
      ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {})
    }
  });
  const client = new Client({ name: "specforge-design-context", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    const result = await client.callTool({ name, arguments: arguments_ });
    const message = Array.isArray(result.content)
      ? result.content.map((item) => "text" in item ? item.text : "").filter(Boolean).join("")
      : "";
    if (result.isError) throw new Error(message || `MCP tool failed: ${name}`);
    return message ? JSON.parse(message) : undefined;
  } finally {
    await client.close();
    await transport.close();
  }
}

async function readDotEnvDatabaseUrl(): Promise<string | undefined> {
  try {
    const line = (await readFile(resolve(process.cwd(), ".env"), "utf8"))
      .split(/\r?\n/u)
      .find((candidate) => /^DATABASE_URL=/u.test(candidate));
    return line?.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/gu, "");
  } catch {
    return undefined;
  }
}

async function preflight(args: Arguments): Promise<void> {
  const result = await callMcpTool("prepare_design_change", {
    intent: required(args, "intent"),
    affectedFactIds: list(required(args, "affected")),
    expectedEvidenceRefs: list(required(args, "evidence")),
    architectureScope: architectureScope(args)
  }) as { receipt?: { sessionId?: string } };
  const sessionId = result.receipt?.sessionId;
  if (!sessionId) throw new Error("MCP preflight did not return a session receipt.");
  const directory = resolve(process.cwd(), ".specforge", "design-context");
  await mkdir(directory, { recursive: true });
  const receiptPath = resolve(directory, `${sessionId.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`);
  await writeFile(receiptPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...result, receiptPath }, null, 2));
}

async function close(args: Arguments): Promise<void> {
  const result = await callMcpTool("close_design_change_session", {
    sessionId: required(args, "session"),
    status: required(args, "status"),
    verificationEvidenceRefs: list(required(args, "evidence")),
    ...(args.reason ? { closureReason: args.reason } : {}),
    architectureScope: architectureScope(args)
  });
  console.log(JSON.stringify(result, null, 2));
}

async function main(): Promise<void> {
  const [command, ...values] = process.argv.slice(2).filter((value) => value !== "--");
  const args = parseArguments(values);
  if (command === "preflight") return preflight(args);
  if (command === "close") return close(args);
  throw new Error("Usage: pnpm design-context:preflight -- --intent <text> --affected <id,...> --evidence <ref,...> | pnpm design-context:close -- --session <id> --status <CONVERGED|BLOCKED> --evidence <ref,...>");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
