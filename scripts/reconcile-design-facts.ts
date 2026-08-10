import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  designEvidenceId,
  type DesignFactManifestDecision,
  type ManagedDesignAsset,
  type ManagedDesignRelationship
} from "./sync-design-facts";

type Decision = Pick<DesignFactManifestDecision, "id" | "mcpAdrId" | "proposalId" | "contextPackId" | "relatedAssetIds" | "managedAssets" | "managedRelationships" | "evidence" | "scope">;
type Manifest = { decisions: Decision[] };
type PersistedAdr = {
  id?: string;
  proposalId?: string;
  command?: string;
  result?: string;
  status?: string;
  architectureScope?: { applicationServiceId?: string; scopePath?: string };
  localizedContent?: { en?: unknown; zh?: unknown };
};
type RecordType = "adr" | "proposal" | "contextPack" | "evidence" | ManagedDesignAsset["assetType"];
type Link = {
  sourceLogicalId?: string;
  targetLogicalId?: string;
  label?: string;
  sourceId?: string;
  targetId?: string;
  relationType?: string;
  architectureScope?: { applicationServiceId?: string; scopePath?: string };
};
type LocalizationShape = { stringFields: string[]; arrayFields?: string[] };

const adrLocalizationShape: LocalizationShape = {
  stringFields: ["name", "title", "description", "context", "decision"],
  arrayFields: ["alternatives", "consequences", "constraints"]
};
const proposalLocalizationShape: LocalizationShape = {
  stringFields: ["name", "title", "description", "background", "goal", "nonGoal", "scope", "rolloutPlan"],
  arrayFields: ["specChanges", "risks"]
};
const contextPackLocalizationShape: LocalizationShape = {
  stringFields: ["name", "summary", "generatedMarkdown"],
  arrayFields: ["constraints", "instructions"]
};
const evidenceLocalizationShape: LocalizationShape = {
  stringFields: ["name", "description", "command", "result"]
};
const managedAssetLocalizationShape: LocalizationShape = {
  stringFields: ["name", "description"]
};

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
      else if (!matchesScope(adr, decision.scope)) report.outOfScope.push(decision.id);
      else if (!hasLocalizedContent(adr, adrLocalizationShape)) report.mismatched.push(decision.id);
      else {
        const proposal = await input.find("proposal", decision);
        const contextPack = await input.find("contextPack", decision);
        if (!proposal) report.missing.push(`${decision.id}:proposal`);
        else if (proposal.id !== decision.proposalId) report.mismatched.push(`${decision.id}:proposal`);
        else if (!matchesScope(proposal, decision.scope)) report.outOfScope.push(`${decision.id}:proposal`);
        else if (!hasLocalizedContent(proposal, proposalLocalizationShape)) report.mismatched.push(`${decision.id}:proposal`);
        else if (!contextPack) report.missing.push(`${decision.id}:contextPack`);
        else if (contextPack.id !== decision.contextPackId || contextPack.proposalId !== decision.proposalId) report.mismatched.push(`${decision.id}:contextPack`);
        else if (!matchesScope(contextPack, decision.scope)) report.outOfScope.push(`${decision.id}:contextPack`);
        else if (!hasLocalizedContent(contextPack, contextPackLocalizationShape)) report.mismatched.push(`${decision.id}:contextPack`);
        else if (input.findLinks) {
          const links = await input.findLinks(decision);
          if (!hasLink(links, decision.scope, decision.proposalId, decision.mcpAdrId, "IMPLEMENTS_DECISION")) report.missing.push(`${decision.id}:proposal-adr-link`);
          else if (!hasLink(links, decision.scope, decision.contextPackId, decision.proposalId, "IMPLEMENTS_CONTEXT_FOR")) report.missing.push(`${decision.id}:context-proposal-link`);
          else if (decision.relatedAssetIds.some((assetId) => !hasLink(links, decision.scope, decision.mcpAdrId, assetId, "DECIDES"))) report.missing.push(`${decision.id}:adr-asset-link`);
          else {
            for (const [index, expected] of decision.evidence.entries()) {
              const evidenceId = designEvidenceId(decision.id, index);
              const evidence = await input.find("evidence", decision, evidenceId);
              if (!evidence) report.missing.push(`${decision.id}:evidence`);
              else if (!matchesScope(evidence, decision.scope)) report.outOfScope.push(`${decision.id}:evidence`);
              else if (evidence.command !== expected.command || evidence.result !== expected.result || !hasLocalizedContent(evidence, evidenceLocalizationShape)) report.mismatched.push(`${decision.id}:evidence`);
              else if (evidence.status !== "passed") report.blocked.push(`${decision.id}:evidence`);
              else if (!hasLink(links, decision.scope, evidenceId, decision.mcpAdrId, "VALIDATES")) report.missing.push(`${decision.id}:evidence-link`);
            }
            for (const managed of decision.managedAssets ?? []) {
              const asset = await input.find(managed.assetType, decision, managed.asset.id);
              if (!asset) report.missing.push(`${decision.id}:managed-asset:${managed.asset.id}`);
              else if (asset.id !== managed.asset.id) report.mismatched.push(`${decision.id}:managed-asset:${managed.asset.id}`);
              else if (!matchesScope(asset, decision.scope)) report.outOfScope.push(`${decision.id}:managed-asset:${managed.asset.id}`);
              else if (!hasLocalizedContent(asset, managedAssetLocalizationShape)) report.mismatched.push(`${decision.id}:managed-asset:${managed.asset.id}`);
            }
            for (const relationship of decision.managedRelationships ?? []) {
              if (!hasManagedLink(links, decision.scope, relationship)) {
                report.missing.push(`${decision.id}:managed-link:${relationship.sourceId}:${relationship.relationType}:${relationship.targetId}`);
              }
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

function matchesScope(record: PersistedAdr, expectedScope: Decision["scope"]): boolean {
  return matchesArchitectureScope(record.architectureScope, expectedScope);
}

function matchesArchitectureScope(
  actualScope: { applicationServiceId?: string; scopePath?: string } | undefined,
  expectedScope: Decision["scope"]
): boolean {
  return actualScope?.applicationServiceId === expectedScope.applicationServiceId
    && actualScope?.scopePath === expectedScope.scopePath;
}

function hasLocalizedContent(record: PersistedAdr, shape: LocalizationShape): boolean {
  return hasLocaleFields(record.localizedContent?.en, shape) && hasLocaleFields(record.localizedContent?.zh, shape);
}

function hasLocaleFields(value: unknown, shape: LocalizationShape): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const localized = value as Record<string, unknown>;
  if (!shape.stringFields.every((field) => typeof localized[field] === "string" && localized[field].trim())) return false;
  return (shape.arrayFields ?? []).every((field) => {
    const entries = localized[field];
    return Array.isArray(entries)
      && entries.length > 0
      && entries.every((entry) => typeof entry === "string" && entry.trim());
  });
}

function hasDecisionIssue(report: DesignFactReconciliationReport, decisionId: string): boolean {
  return [report.missing, report.mismatched, report.outOfScope, report.blocked].some((items) => items.some((item) => item === decisionId || item.startsWith(`${decisionId}:`)));
}

function hasLink(links: Link[], expectedScope: Decision["scope"], sourceId: string, targetId: string, relationType: string): boolean {
  return links.some((link) => (link.sourceLogicalId === sourceId || link.sourceId === sourceId)
    && (link.targetLogicalId === targetId || link.targetId === targetId)
    && (link.label === relationType || link.relationType === relationType)
    && matchesArchitectureScope(link.architectureScope, expectedScope));
}

function hasManagedLink(links: Link[], expectedScope: Decision["scope"], relationship: ManagedDesignRelationship): boolean {
  return hasLink(links, expectedScope, relationship.sourceId, relationship.targetId, relationship.relationType);
}

export function reconciliationExitCode(report: DesignFactReconciliationReport): 0 | 1 {
  return report.missing.length || report.mismatched.length || report.outOfScope.length || report.blocked.length ? 1 : 0;
}

async function main(): Promise<void> {
  const fullManifest = JSON.parse(await readFile("docs/design-facts/baseline-manifest.json", "utf8")) as Manifest;
  const requestedIds = (process.env.SPECFORGE_DESIGN_FACT_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  const manifest: Manifest = requestedIds.length === 0
    ? fullManifest
    : { ...fullManifest, decisions: fullManifest.decisions.filter((decision) => requestedIds.includes(decision.id) || requestedIds.includes(decision.mcpAdrId)) };
  if (requestedIds.length > 0 && manifest.decisions.length === 0) throw new Error(`DESIGN_FACT_SELECTION_EMPTY: ${requestedIds.join(",")}`);
  const requireFromMcp = createRequire(resolve(process.cwd(), "apps/mcp-server/package.json"));
  const { Client } = requireFromMcp("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = requireFromMcp("@modelcontextprotocol/sdk/client/stdio.js");
  const mcpServerEntry = resolve(process.cwd(), "apps/mcp-server/src/index.ts");
  const tsxCli = resolve(process.cwd(), "apps/mcp-server/node_modules/tsx/dist/cli.mjs");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [tsxCli, mcpServerEntry],
    cwd: process.cwd(),
    env: {
      ...process.env,
      CI: process.env.CI ?? "true",
      SPECFORGE_MCP_SEED: "1",
      ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {})
    }
  });
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
  } finally {
    await client.close();
    await transport.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
