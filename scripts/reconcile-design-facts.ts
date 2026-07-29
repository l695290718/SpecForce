import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { designEvidenceId, type DesignFactManifestDecision } from "./sync-design-facts";

type Decision = Pick<DesignFactManifestDecision, "id" | "mcpAdrId" | "proposalId" | "contextPackId" | "relatedAssetIds" | "evidence" | "scope">;
type Manifest = { decisions: Decision[] };
type PersistedAdr = { id?: string; command?: string; result?: string; status?: string; architectureScope?: { applicationServiceId?: string; scopePath?: string }; localizedContent?: { zh?: unknown } };
type RecordType = "adr" | "proposal" | "contextPack" | "evidence";
type Link = { sourceLogicalId?: string; targetLogicalId?: string; label?: string; sourceId?: string; targetId?: string; relationType?: string };

export interface DesignFactReconciliationReport {
  missing: string[];
  mismatched: string[];
  outOfScope: string[];
  blocked: string[];
  verified: string[];
}

export async function reconcileDesignFacts(input: {
  manifest: Manifest;
  find: (type: RecordType, decision: Decision, assetId?: string) => Promise<PersistedAdr | undefined>;
  findLinks?: (decision: Decision) => Promise<Link[]>;
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
        else if (input.findLinks) {
          const links = await input.findLinks(decision);
          if (!hasLink(links, decision.proposalId, decision.mcpAdrId, "IMPLEMENTS_DECISION")) report.missing.push(`${decision.id}:proposal-adr-link`);
          else if (!hasLink(links, decision.contextPackId, decision.proposalId, "IMPLEMENTS_CONTEXT_FOR")) report.missing.push(`${decision.id}:context-proposal-link`);
          else if (decision.relatedAssetIds.some((assetId) => !hasLink(links, decision.mcpAdrId, assetId, "DECIDES"))) report.missing.push(`${decision.id}:adr-asset-link`);
          else {
            for (const [index, expected] of decision.evidence.entries()) {
              const evidenceId = designEvidenceId(decision.id, index);
              const evidence = await input.find("evidence", decision, evidenceId);
              if (!evidence) report.missing.push(`${decision.id}:evidence`);
              else if (evidence.architectureScope?.applicationServiceId !== decision.scope.applicationServiceId || evidence.architectureScope?.scopePath !== decision.scope.scopePath) report.outOfScope.push(`${decision.id}:evidence`);
              else if (evidence.command !== expected.command || evidence.result !== expected.result || !hasEvidenceLocalization(evidence)) report.mismatched.push(`${decision.id}:evidence`);
              else if (evidence.status !== "passed") report.blocked.push(`${decision.id}:evidence`);
              else if (!hasLink(links, evidenceId, decision.mcpAdrId, "VALIDATES")) report.missing.push(`${decision.id}:evidence-link`);
            }
            if (!hasDecisionIssue(report, decision.id)) report.verified.push(decision.id);
          }
        } else report.verified.push(decision.id);
      }
    } catch {
      report.blocked.push(decision.id);
    }
  }
  return report;
}

function hasEvidenceLocalization(evidence: PersistedAdr): boolean {
  const zh = evidence.localizedContent?.zh;
  if (!zh || typeof zh !== "object" || Array.isArray(zh)) return false;
  const localized = zh as Record<string, unknown>;
  return ["name", "description", "command", "result"].every((field) => typeof localized[field] === "string" && localized[field].trim());
}

function hasDecisionIssue(report: DesignFactReconciliationReport, decisionId: string): boolean {
  return [report.missing, report.mismatched, report.outOfScope, report.blocked].some((items) => items.some((item) => item === decisionId || item.startsWith(`${decisionId}:`)));
}

function hasLink(links: Link[], sourceId: string, targetId: string, relationType: string): boolean {
  return links.some((link) => (link.sourceLogicalId === sourceId || link.sourceId === sourceId)
    && (link.targetLogicalId === targetId || link.targetId === targetId)
    && (link.label === relationType || link.relationType === relationType));
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
      find: async (type, decision, requestedAssetId) => {
        const assetId = type === "adr" ? decision.mcpAdrId : type === "proposal" ? decision.proposalId : type === "contextPack" ? decision.contextPackId : requestedAssetId ?? designEvidenceId(decision.id, 0);
        const result = await client.callTool({ name: "get_asset_detail", arguments: { assetType: type, assetId, applicationServiceId: decision.scope.applicationServiceId, format: "json" } });
        if (result.isError) return undefined;
        const text = Array.isArray(result.content) ? result.content.map((item) => "text" in item ? item.text : "").join("") : "";
        const parsed = JSON.parse(text) as { asset?: PersistedAdr };
        return parsed.asset;
      },
      findLinks: async (decision) => {
        const result = await client.callTool({ name: "list_asset_links", arguments: { applicationServiceId: decision.scope.applicationServiceId } });
        if (result.isError) return [];
        const text = Array.isArray(result.content) ? result.content.map((item) => "text" in item ? item.text : "").join("") : "";
        return JSON.parse(text) as Link[];
      }
    });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = reconciliationExitCode(report);
  } finally { await client.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
