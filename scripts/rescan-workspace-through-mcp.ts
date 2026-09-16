import { createRequire } from "node:module";
import { resolve } from "node:path";

import { scanWorkspace } from "./scan-workspace";

type Scope = { applicationServiceId: string; scopePath: string };
type ToolResult = { content?: Array<{ text?: string }>; isError?: boolean };
type Client = { callTool(input: { name: string; arguments: Record<string, unknown> }): Promise<ToolResult>; connect(transport: unknown): Promise<void>; close(): Promise<void> };

const scope: Scope = {
  applicationServiceId: process.env.SPECFORGE_APPLICATION_SERVICE_ID ?? "com.specforge.designcenter",
  scopePath: process.env.SPECFORGE_SCOPE_PATH ?? "pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter"
};
const sessionId = process.env.SPECFORGE_SCAN_SESSION;
const connectorId = "specforge-local-repository-connector";

function parse(result: ToolResult, name: string): any {
  const text = result.content?.map((item) => item.text ?? "").join("") ?? "";
  if (result.isError) throw new Error(`${name}: ${text}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  if (!sessionId) throw new Error("SPECFORGE_SCAN_SESSION is required");
  const root = process.cwd();
  const report = await scanWorkspace({
    root,
    output: `.specforge/scans/${new Date().toISOString().slice(0, 10)}-workspace-scan.json`,
    architectureScope: scope
  });
  console.log(JSON.stringify({ phase: "report-built", reportDigest: report.reportDigest, observations: report.observations.length, coverage: report.coverage }, null, 2));
  const requireFromMcp = createRequire(resolve(root, "apps/mcp-server/package.json"));
  const { Client: McpClient } = requireFromMcp("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = requireFromMcp("@modelcontextprotocol/sdk/client/stdio.js");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(root, "apps/mcp-server/node_modules/tsx/dist/cli.mjs"), resolve(root, "apps/mcp-server/src/index.ts")],
    cwd: root,
    env: { ...process.env, SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: scope.applicationServiceId }
  });
  const client = new McpClient({ name: "specforge-workspace-rescan", version: "0.1.0" }, { capabilities: {} }) as Client;
  await client.connect(transport);
  try {
    await call(client, "register_connector", { id: connectorId, kind: "local-repository", capabilities: ["OBSERVE"], status: "ACTIVE", architectureScope: scope });
    console.log(JSON.stringify({ phase: "connector-ready", connectorId }, null, 2));
    const persisted = await call(client, "submit_scan_report", {
      id: `scan-report:${report.reportDigest}`,
      connectorId,
      designChangeSessionId: sessionId,
      architectureScope: scope,
      report
    });
    console.log(JSON.stringify({ status: persisted.status, scanReportId: persisted.id, reportDigest: report.reportDigest, observations: report.observations.length, coverage: report.coverage }, null, 2));
  } finally {
    await client.close();
    await transport.close();
  }
}

async function call(client: Client, name: string, arguments_: Record<string, unknown>) {
  return parse(await client.callTool({ name, arguments: arguments_ }), name);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
