import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";

const root = process.cwd();
const architectureScope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

function textResult(result: unknown): string {
  if (!result || typeof result !== "object" || !("content" in result)) return "";
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((item): item is { type: string; text: string } => Boolean(item && typeof item === "object" && "type" in item && "text" in item))
    .map((item) => item.text)
    .join("");
}

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, "apps", "mcp-server", "node_modules", "tsx", "dist", "cli.mjs"), path.join(root, "apps", "mcp-server", "src", "index.ts")],
    cwd: root,
    env: { ...process.env, CI: process.env.CI ?? "true", SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: architectureScope.applicationServiceId },
    stderr: "inherit"
  });
  const client = new Client({ name: "specforge-3a-bootstrap", version: "0.1.0" }, { capabilities: {}, requestTimeout: 300_000 });
  console.error("[bootstrap-3a] connecting");
  await client.connect(transport);
  console.error("[bootstrap-3a] connected");
  try {
    console.error("[bootstrap-3a] preparing design change");
    const result = await client.callTool({
      name: "prepare_design_change",
      arguments: {
        intent: "Bootstrap the exact-Scope 3A Knowledge Baseline and PostgreSQL projection from the existing authored design assets so the 3A browser has an official bilingual source.",
        affectedFactIds: [
          "adr-3a-architecture-navigation-workspace",
          "adr-unified-3a-knowledge-initialization",
          "data-specforge-3a-projection-read-model",
          "rule-specforge-3a-projection-publication",
          "data-specforge-assets"
        ],
        expectedEvidenceRefs: ["canonical-design-assets-present", "3a-baseline-empty", "3a-browser-empty-state"],
        architectureScope
      }
    });
    if (result && typeof result === "object" && "isError" in result && result.isError) throw new Error(textResult(result));
    const receipt = JSON.parse(textResult(result)).receipt as { sessionId: string };
    const migration = await client.callTool({
      name: "bootstrap_3a_from_design_assets",
      arguments: { architectureScope, designChangeSessionId: receipt.sessionId }
    });
    if (migration && typeof migration === "object" && "isError" in migration && migration.isError) throw new Error(textResult(migration));
    const migrationResult = JSON.parse(textResult(migration)) as { baselineId: string };
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
    });
    if (build && typeof build === "object" && "isError" in build && build.isError) throw new Error(textResult(build));
    process.stdout.write(JSON.stringify({ preflight: JSON.parse(textResult(result)), migration: JSON.parse(textResult(migration)), build: JSON.parse(textResult(build)) }, null, 2));
  } finally {
    await client.close();
    await transport.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
