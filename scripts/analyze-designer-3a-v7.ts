import { readFile } from "node:fs/promises";
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
  const candidateFile = resolve(root, required(args, "candidate-file"));
  const candidate = JSON.parse(await readFile(candidateFile, "utf8")) as JsonRecord;
  const databaseUrl = process.env.DATABASE_URL ?? (await readDotEnvDatabaseUrl());
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
    env: {
      ...process.env,
      ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
      SPECFORGE_MCP_SEED: "1",
      SPECFORGE_MCP_SEED_SCOPE: scope.applicationServiceId
    }
  });
  const client = new Client({ name: "designer-3a-v7-candidate-analysis", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    const response = (await client.callTool({
      name: "analyze_3a_architecture_candidates",
      arguments: {
        architectureScope: scope,
        sourceBaselineId: required(args, "source-baseline"),
        designChangeSessionId: required(args, "session"),
        intent: required(args, "intent"),
        idempotencyKey: required(args, "idempotency-key"),
        evidenceRefs: candidate.evidenceRefs,
        candidateBatch: candidate
      }
    })) as McpResponse;
    const raw = text(response);
    if (response.isError) throw new Error(raw || "MCP candidate analysis failed");
    console.log(raw || "{}");
  } finally {
    await client.close();
    await transport.close();
  }
}

async function readDotEnvDatabaseUrl(): Promise<string | undefined> {
  try {
    const content = await readFile(resolve(root, ".env"), "utf8");
    return content
      .split(/\r?\n/u)
      .find((line) => line.startsWith("DATABASE_URL="))
      ?.slice("DATABASE_URL=".length)
      .trim()
      .replace(/^['"]|['"]$/gu, "");
  } catch {
    return undefined;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
