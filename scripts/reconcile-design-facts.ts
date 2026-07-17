import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type Decision = { id: string; mcpAdrId: string; proposalId: string; contextPackId: string; scope: { applicationServiceId: string; scopePath: string } };
type Manifest = { decisions: Decision[] };
type PersistedAdr = { id?: string; architectureScope?: { applicationServiceId?: string; scopePath?: string }; localizedContent?: { zh?: unknown } };
type RecordType = "adr" | "proposal" | "contextPack";

export interface DesignFactReconciliationReport {
  missing: string[];
  mismatched: string[];
  outOfScope: string[];
  blocked: string[];
  verified: string[];
}

export async function reconcileDesignFacts(input: {
  manifest: Manifest;
  find: (type: RecordType, decision: Decision) => Promise<PersistedAdr | undefined>;
}): Promise<DesignFactReconciliationReport> {
  const report: DesignFactReconciliationReport = { missing: [], mismatched: [], outOfScope: [], blocked: [], verified: [] };
  for (const decision of input.manifest.decisions) {
    try {
      const adr = await input.find("adr", decision);
      if (!adr) report.missing.push(decision.id);
      else if (adr.id !== decision.mcpAdrId) report.mismatched.push(decision.id);
      else if (adr.architectureScope?.applicationServiceId !== decision.scope.applicationServiceId || adr.architectureScope?.scopePath !== decision.scope.scopePath) report.outOfScope.push(decision.id);
      else if (!adr.localizedContent?.zh) report.mismatched.push(decision.id);
      else {
        const proposal = await input.find("proposal", decision);
        const contextPack = await input.find("contextPack", decision);
        if (!proposal) report.missing.push(`${decision.id}:proposal`);
        else if (!contextPack) report.missing.push(`${decision.id}:contextPack`);
        else report.verified.push(decision.id);
      }
    } catch {
      report.blocked.push(decision.id);
    }
  }
  return report;
}

export function reconciliationExitCode(report: DesignFactReconciliationReport): 0 | 1 {
  return report.missing.length || report.mismatched.length || report.outOfScope.length || report.blocked.length ? 1 : 0;
}

async function main(): Promise<void> {
  const manifest = JSON.parse(await readFile("docs/design-facts/baseline-manifest.json", "utf8")) as Manifest;
  const requireFromMcp = createRequire(resolve(process.cwd(), "apps/mcp-server/package.json"));
  const { Client } = requireFromMcp("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = requireFromMcp("@modelcontextprotocol/sdk/client/stdio.js");
  const transport = new StdioClientTransport({ command: "pnpm", args: ["--filter", "@specforge/mcp-server", "dev"], cwd: process.cwd(), env: { ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}) } });
  const client = new Client({ name: "specforge-design-fact-reconcile", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    const report = await reconcileDesignFacts({
      manifest,
      find: async (type, decision) => {
        const assetId = type === "adr" ? decision.mcpAdrId : type === "proposal" ? decision.proposalId : decision.contextPackId;
        const result = await client.callTool({ name: "get_asset_detail", arguments: { assetType: type, assetId, applicationServiceId: decision.scope.applicationServiceId, format: "json" } });
        if (result.isError) return undefined;
        const text = Array.isArray(result.content) ? result.content.map((item) => "text" in item ? item.text : "").join("") : "";
        const parsed = JSON.parse(text) as { asset?: PersistedAdr };
        return parsed.asset;
      }
    });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = reconciliationExitCode(report);
  } finally { await client.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
