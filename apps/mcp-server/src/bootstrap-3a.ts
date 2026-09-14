import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";

const root = process.cwd();
const architectureScope = {
  applicationServiceId: "com.specforge.designcenter",
  scopePath: "pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter"
};

const projectionPollIntervalMs = Number(process.env.SPECFORGE_3A_BOOTSTRAP_POLL_INTERVAL_MS ?? "1000");
const projectionPollTimeoutMs = Number(process.env.SPECFORGE_3A_BOOTSTRAP_TIMEOUT_MS ?? "300000");

function textResult(result: unknown): string {
  if (!result || typeof result !== "object" || !("content" in result)) return "";
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((item): item is { type: string; text: string } => Boolean(item && typeof item === "object" && "type" in item && "text" in item))
    .map((item) => item.text)
    .join("");
}

function parseJsonResult<T>(result: unknown): T {
  const text = textResult(result);
  if (!text) throw new Error("MCP_EMPTY_RESULT");
  return JSON.parse(text) as T;
}

function assertToolSuccess(result: unknown): void {
  if (result && typeof result === "object" && "isError" in result && result.isError) throw new Error(textResult(result));
}

async function closeSession(client: Client, sessionId: string, status: "CONVERGED" | "BLOCKED", evidence: string[], closureReason?: string): Promise<void> {
  const result = await client.callTool({
    name: "close_design_change_session",
    arguments: {
      sessionId,
      status,
      verificationEvidenceRefs: evidence,
      ...(closureReason ? { closureReason } : {}),
      architectureScope
    }
  }, undefined, { timeout: 300_000, maxTotalTimeout: 300_000 });
  assertToolSuccess(result);
}

async function waitForProjection(client: Client, buildId: string): Promise<Record<string, unknown>> {
  const deadline = Date.now() + projectionPollTimeoutMs;
  while (Date.now() < deadline) {
    const result = await client.callTool({
      name: "get_3a_projection_build",
      arguments: { architectureScope, id: buildId }
    }, undefined, { timeout: 300_000, maxTotalTimeout: 300_000 });
    assertToolSuccess(result);
    const status = parseJsonResult<Record<string, unknown>>(result);
    if (status.status === "READY") return status;
    if (status.status === "FAILED") throw new Error(`THREE_A_PROJECTION_FAILED: ${String(status.errorCode ?? status.diagnosticRef ?? "unknown")}`);
    await new Promise((resolve) => setTimeout(resolve, projectionPollIntervalMs));
  }
  throw new Error(`THREE_A_PROJECTION_TIMEOUT: ${projectionPollTimeoutMs}ms`);
}

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, "apps", "mcp-server", "node_modules", "tsx", "dist", "cli.mjs"), path.join(root, "apps", "mcp-server", "src", "index.ts")],
    cwd: root,
    env: { ...process.env, CI: process.env.CI ?? "true", SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: architectureScope.applicationServiceId },
    stderr: "inherit"
  });
  const client = new Client({ name: "specforge-3a-bootstrap", version: "0.1.0" }, { capabilities: {} });
  const requestOptions = { timeout: 300_000, maxTotalTimeout: 300_000 };
  console.error("[bootstrap-3a] connecting");
  await client.connect(transport);
  console.error("[bootstrap-3a] connected");
  let sessionId: string | undefined;
  try {
    console.error("[bootstrap-3a] preparing design change");
    const result = await client.callTool({
      name: "prepare_design_change",
      arguments: {
        intent: "Bootstrap the exact-Scope 3A Knowledge Baseline and PostgreSQL projection from the existing authored design assets so the 3A browser has an official bilingual source.",
        affectedFactIds: [
          "adr-mcp-first-architecture",
          "adr-canonical-english-localized-overlay",
          "api-specforge-mcp-tools",
          "data-specforge-assets",
          "data-specforge-asset-graph"
        ],
        expectedEvidenceRefs: ["canonical-design-assets-present", "3a-baseline-empty", "3a-browser-empty-state"],
        architectureScope
      }
    }, undefined, requestOptions);
    assertToolSuccess(result);
    const receipt = parseJsonResult<{ receipt: { sessionId: string } }>(result).receipt;
    sessionId = receipt.sessionId;
    const migration = await client.callTool({
      name: "bootstrap_3a_from_design_assets",
      arguments: { architectureScope, designChangeSessionId: receipt.sessionId }
    }, undefined, requestOptions);
    assertToolSuccess(migration);
    const migrationResult = parseJsonResult<{ baselineId: string }>(migration);
    const build = await client.callTool({
      name: "request_3a_projection_build",
      arguments: {
        architectureScope,
        baselineId: migrationResult.baselineId,
        profileId: "generic-system",
        profileVersion: "1",
        projectionSchemaVersion: "3a.v2",
        query: { layers: ["BIZ", "SYS", "TECH"] }
      }
    }, undefined, requestOptions);
    assertToolSuccess(build);
    const buildResult = parseJsonResult<{ id: string; status?: string; manifestId?: string }>(build);
    console.error(`[bootstrap-3a] waiting for projection build ${buildResult.id}`);
    const projection = buildResult.status === "READY" ? buildResult : await waitForProjection(client, buildResult.id);
    await closeSession(client, receipt.sessionId, "CONVERGED", [
      `bootstrap_3a_from_design_assets=${migrationResult.baselineId}`,
      `request_3a_projection_build=${buildResult.id}`,
      `get_3a_projection_build=${String(projection.status)}`
    ]);
    process.stdout.write(JSON.stringify({ preflight: parseJsonResult(result), migration: migrationResult, build: buildResult, projection, session: { id: receipt.sessionId, status: "CONVERGED" } }, null, 2));
  } catch (error) {
    if (sessionId) {
      try {
        await closeSession(client, sessionId, "BLOCKED", ["bootstrap-3a=failed"], error instanceof Error ? error.message : String(error));
      } catch (closeError) {
        console.error(`[bootstrap-3a] unable to close blocked session: ${closeError instanceof Error ? closeError.message : String(closeError)}`);
      }
    }
    throw error;
  } finally {
    await client.close();
    await transport.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
