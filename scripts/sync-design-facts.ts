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

type CallTool = (name: string, input: Record<string, unknown>) => Promise<{ ok?: boolean; isError?: boolean; message?: string }>;

export async function synchronizeDesignFacts(input: {
  callTool: CallTool;
  manifest: DesignFactManifest;
  readAdr: (path: string) => Promise<AdrSource>;
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

    receipts.push({ id: decision.id, mcpAdrId: decision.mcpAdrId, status: "complete" });
  }

  return receipts;
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
