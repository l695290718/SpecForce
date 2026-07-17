import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface DesignFactManifestDecision {
  id: string;
  repositoryAdr: string;
  mcpAdrId: string;
  scope: { applicationServiceId: string; scopePath: string };
  proposalId: string;
  contextPackId: string;
  relatedAssetIds: string[];
  evidence: Array<{ command: string; result: string }>;
}

export interface DesignFactManifest {
  decisions: DesignFactManifestDecision[];
}

export interface AdrSource {
  title: string;
  english: string;
  chinese: string;
}

export interface DesignFactSyncReceipt {
  id: string;
  mcpAdrId: string;
  status: "complete";
}

export function designEvidenceId(decisionId: string, index: number): string {
  return `evidence-${decisionId}-${index + 1}`;
}

type CallTool = (name: string, input: Record<string, unknown>) => Promise<{ ok?: boolean; isError?: boolean; message?: string }>;
type ExistingRecordType = "proposal" | "contextPack";

export async function synchronizeDesignFacts(input: {
  callTool: CallTool;
  manifest: DesignFactManifest;
  readAdr: (path: string) => Promise<AdrSource>;
  readExisting?: (type: ExistingRecordType, id: string, scope: DesignFactManifestDecision["scope"]) => Promise<Record<string, unknown> | undefined>;
}): Promise<DesignFactSyncReceipt[]> {
  const receipts: DesignFactSyncReceipt[] = [];

  for (const decision of input.manifest.decisions) {
    assertDecision(decision);
    const source = await input.readAdr(decision.repositoryAdr);
    if (!source.english.trim() || !source.chinese.trim()) throw new Error(`DESIGN_FACT_LOCALIZATION_MISSING: ${decision.id}`);

    const result = await input.callTool("create_adr", {
      applicationServiceId: decision.scope.applicationServiceId,
      architectureScope: decision.scope,
      adr: buildAdr(decision, source)
    });
    if (result.isError || result.ok === false) {
      throw new Error(`DESIGN_FACT_MCP_WRITE_FAILED: ${decision.id}${result.message ? `: ${result.message}` : ""}`);
    }

    if (input.readExisting) {
      const proposal = await input.readExisting("proposal", decision.proposalId, decision.scope);
      const contextPack = await input.readExisting("contextPack", decision.contextPackId, decision.scope);
      const syncedProposal = proposal ?? buildProposal(decision, source);
      const syncedContextPack = contextPack ?? buildContextPack(decision, source);
      await callOrThrow(input.callTool, "upsert_proposal", { proposal: syncedProposal, architectureScope: decision.scope }, decision.id);
      await callOrThrow(input.callTool, "upsert_context_pack", { contextPack: syncedContextPack, architectureScope: decision.scope }, decision.id);
      await callOrThrow(input.callTool, "link_assets", link("proposal", decision.proposalId, "adr", decision.mcpAdrId, "IMPLEMENTS_DECISION", decision.scope), decision.id);
      await callOrThrow(input.callTool, "link_assets", link("contextPack", decision.contextPackId, "proposal", decision.proposalId, "IMPLEMENTS_CONTEXT_FOR", decision.scope), decision.id);
      for (const assetId of decision.relatedAssetIds) {
        await callOrThrow(input.callTool, "link_assets", link("adr", decision.mcpAdrId, assetTypeFor(assetId), assetId, "DECIDES", decision.scope), decision.id);
      }
    }

    for (const [index, evidence] of decision.evidence.entries()) {
      const evidenceId = designEvidenceId(decision.id, index);
      await callOrThrow(input.callTool, "upsert_design_asset", {
        assetType: "evidence",
        asset: buildEvidence(decision, source, evidenceId, evidence),
        architectureScope: decision.scope
      }, decision.id);
      await callOrThrow(input.callTool, "link_assets", link("evidence", evidenceId, "adr", decision.mcpAdrId, "VALIDATES", decision.scope), decision.id);
    }

    receipts.push({ id: decision.id, mcpAdrId: decision.mcpAdrId, status: "complete" });
  }

  return receipts;
}

function buildProposal(decision: DesignFactManifestDecision, source: AdrSource) {
  const now = new Date().toISOString();
  return { id: decision.proposalId, name: source.title, title: source.title, description: source.english, background: source.english, goal: source.english, nonGoal: "No additional product behavior.", scope: source.english, impactedAssets: [], specChanges: [], risks: [], rolloutPlan: "Maintain through MCP.", status: "implemented", createdAt: now, updatedAt: now, localizedContent: { zh: { name: localizedTitle(source.chinese), title: localizedTitle(source.chinese), description: source.chinese, background: source.chinese, goal: source.chinese, nonGoal: "不增加额外产品行为。", scope: source.chinese, specChanges: [], risks: [], rolloutPlan: "通过 MCP 维护。" } } };
}

function buildContextPack(decision: DesignFactManifestDecision, source: AdrSource) {
  const now = new Date().toISOString();
  return { id: decision.contextPackId, name: `${source.title} Context Pack`, proposalId: decision.proposalId, targetAgent: "generic", summary: source.english, includedAssets: [], constraints: [], instructions: [], generatedMarkdown: source.english, createdAt: now, architectureScope: decision.scope, localizedContent: { zh: { name: `${localizedTitle(source.chinese)} 上下文包`, summary: source.chinese, constraints: [], instructions: [], generatedMarkdown: source.chinese } } };
}

function buildEvidence(
  decision: DesignFactManifestDecision,
  source: AdrSource,
  id: string,
  evidence: DesignFactManifestDecision["evidence"][number]
) {
  const now = new Date().toISOString();
  const name = `${source.title} verification evidence`;
  const description = `Verification evidence for ${source.title}.`;
  return {
    id,
    name,
    description,
    decisionId: decision.mcpAdrId,
    command: evidence.command,
    result: evidence.result,
    status: "passed" as const,
    recordedAt: now,
    createdAt: now,
    updatedAt: now,
    localizedContent: {
      zh: {
        name: `${localizedTitle(source.chinese)} 验证证据`,
        description: `用于验证 ${localizedTitle(source.chinese)} 的证据。`,
        command: evidence.command,
        result: evidence.result
      }
    }
  };
}

async function callOrThrow(callTool: CallTool, name: string, input: Record<string, unknown>, decisionId: string): Promise<void> {
  const result = await callTool(name, input);
  if (result.isError || result.ok === false) throw new Error(`DESIGN_FACT_MCP_WRITE_FAILED: ${decisionId}${result.message ? `: ${result.message}` : ""}`);
}

function link(sourceType: string, sourceId: string, targetType: string, targetId: string, relationType: string, architectureScope: DesignFactManifestDecision["scope"]) {
  return { sourceType, sourceId, targetType, targetId, relationType, architectureScope };
}

function assetTypeFor(id: string): string {
  if (id.startsWith("api-")) return "api";
  if (id.startsWith("data-")) return "dataModel";
  if (id.startsWith("rule-")) return "businessRule";
  if (id.startsWith("quality-")) return "quality";
  if (id.startsWith("adr-")) return "adr";
  return "api";
}

function assertDecision(decision: DesignFactManifestDecision): void {
  if (!decision.scope?.applicationServiceId || !decision.scope.scopePath) {
    throw new Error(`DESIGN_FACT_SCOPE_MISSING: ${decision.id}`);
  }
}

function buildAdr(decision: DesignFactManifestDecision, source: AdrSource) {
  const now = new Date().toISOString();
  return {
    id: decision.mcpAdrId,
    name: source.title,
    title: source.title,
    description: source.english,
    status: "accepted",
    context: source.english,
    decision: source.english,
    alternatives: [],
    consequences: [],
    constraints: [],
    relatedAssets: decision.relatedAssetIds.map((id) => ({ type: "api", id, label: id })),
    owner: "SpecForge Architecture",
    createdAt: now,
    updatedAt: now,
    localizedContent: {
      zh: {
        name: localizedTitle(source.chinese),
        description: source.chinese,
        title: localizedTitle(source.chinese),
        context: source.chinese,
        decision: source.chinese,
        alternatives: [],
        consequences: [],
        constraints: []
      }
    }
  };
}

async function readRepositoryAdr(path: string): Promise<AdrSource> {
  const content = await readFile(path, "utf8");
  const chineseHeading = content.search(/^##\s+[^\x00-\x7F]/m);
  const [english, headedChinese = ""] = chineseHeading >= 0
    ? [content.slice(0, chineseHeading), content.slice(chineseHeading)]
    : content.split(/## .*Chinese Localization/);
  const chinese = headedChinese || content.match(/[\u4e00-\u9fff][\s\S]*/)?.[0] || "";
  const title = english.match(/^#\s+(?:ADR[- ]?\d+:?\s*)?(.+)$/m)?.[1]?.trim() ?? "Architecture decision";
  return { title, english: english.trim(), chinese: chinese.trim() };
}

function localizedTitle(content: string): string {
  return content.replace(/\s+/g, " ").slice(0, 80);
}

async function main(): Promise<void> {
  const manifest = JSON.parse(await readFile("docs/design-facts/baseline-manifest.json", "utf8")) as DesignFactManifest;
  // The SDK is owned by the MCP workspace, not duplicated at the repository root.
  const requireFromMcpWorkspace = createRequire(resolve(process.cwd(), "apps/mcp-server/package.json"));
  const { Client } = requireFromMcpWorkspace("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = requireFromMcpWorkspace("@modelcontextprotocol/sdk/client/stdio.js");
  const transport = new StdioClientTransport({
    command: "pnpm",
    args: ["--filter", "@specforge/mcp-server", "dev"],
    cwd: process.cwd(),
    env: {
      SPECFORGE_MCP_SEED: "1",
      ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {})
    }
  });
  const client = new Client({ name: "specforge-design-fact-sync", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    const receipts = await synchronizeDesignFacts({
      manifest,
      readAdr: readRepositoryAdr,
      readExisting: async (type, id, scope) => {
        const assetType = type === "contextPack" ? "contextPack" : "proposal";
        const result = await client.callTool({ name: "get_asset_detail", arguments: { assetType, assetId: id, applicationServiceId: scope.applicationServiceId, format: "json" } });
        if (result.isError) return undefined;
        const text = Array.isArray(result.content) ? result.content.map((item) => "text" in item ? item.text : "").join("") : "";
        return (JSON.parse(text) as { asset?: Record<string, unknown> }).asset;
      },
      callTool: async (name, arguments_) => {
        const result = await client.callTool({ name, arguments: arguments_ });
        const message = Array.isArray(result.content)
          ? result.content.map((item) => "text" in item ? item.text : "").filter(Boolean).join(" ")
          : undefined;
        return { ok: !result.isError, isError: result.isError, message };
      }
    });
    console.log(JSON.stringify(receipts, null, 2));
  } finally {
    await client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
