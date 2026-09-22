import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type ToolResult = { content?: Array<{ text?: string }>; isError?: boolean };
type Client = { callTool(input: { name: string; arguments: Record<string, unknown> }): Promise<ToolResult>; connect(transport: unknown): Promise<void>; close(): Promise<void> };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scope = {
  applicationServiceId: process.env.SPECFORGE_APPLICATION_SERVICE_ID ?? "com.specforge.designcenter",
  scopePath: process.env.SPECFORGE_SCOPE_PATH ?? "pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter"
};
const repositoryId = process.env.SPECFORGE_REPOSITORY_ID?.trim() || "specforge";
const repositoryIgnorePatterns = [".git/**", ".specforge/**", ".pnpm-store/**", ".tmp-go-build/**", ".worktrees/**", "node_modules/**", "dist/**", ".next/**", "coverage/**", "fixtures/**"];
const connectorId = "specforge-local-repository-connector";
const runId = `governed-repository-scan-${new Date().toISOString().replace(/[-:TZ.]/gu, "").slice(0, 14)}`;
const runDirectory = resolve(root, ".specforge", "scans", runId);
const sessionPath = join(runDirectory, "session.json");
let activeClient: Client | undefined;

async function main(): Promise<void> {
  const designChangeSessionId = required("SPECFORGE_DESIGN_CHANGE_SESSION");
  await mkdir(runDirectory, { recursive: true });
  const releaseSelection = await resolveReleaseSelection();
  const scannerReleaseId = releaseSelection.releaseId;
  const snapshot = releaseSelection.localManifest?.artifactKind === "NATIVE_BINARY"
    ? nativeSnapshot(releaseSelection.localManifest)
    : snapshotIdentity();
  const requireFromMcp = createRequire(resolve(root, "apps/mcp-server/package.json"));
  const { Client: McpClient } = requireFromMcp("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = requireFromMcp("@modelcontextprotocol/sdk/client/stdio.js");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(root, "apps/mcp-server/node_modules/tsx/dist/cli.mjs"), resolve(root, "apps/mcp-server/src/index.ts")],
    cwd: root,
    env: { ...process.env, CI: process.env.CI ?? "true", SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: scope.applicationServiceId }
  });
  activeClient = new McpClient({ name: "specforge-governed-repository-scan", version: "0.1.0" }, { capabilities: {} }) as Client;
  const client = activeClient;
  await client.connect(transport);

  try {
    await call("register_connector", { id: connectorId, kind: "local-repository", capabilities: ["OBSERVE"], status: "ACTIVE", architectureScope: scope });
    const descriptor = await call("start_knowledge_scan", {
      architectureScope: scope,
      connectorId,
      designChangeSessionId,
      scannerReleaseId,
      runtimeProfileId: "default-repository-scan",
      snapshotIdentity: snapshot,
      repositoryPolicy: { allowDirtyWorktree: true, ignorePatterns: repositoryIgnorePatterns },
      evidencePolicy: { sourceMinimization: "metadata-and-digest", repositoryContentIsEvidence: true },
      parserPolicy: { extractorMode: releaseSelection.localManifest?.artifactKind === "NATIVE_BINARY" ? "framework-aware-native" : "portable-repository-observer" },
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    });
    await writeFile(sessionPath, `${JSON.stringify({ ...descriptor, snapshotIdentity: snapshot }, null, 2)}\n`, "utf8");

    const release = await call("get_scanner_release", { architectureScope: scope, sessionId: descriptor.sessionId });
    const manifestPath = join(runDirectory, "scanner-release.json");
    await writeFile(manifestPath, `${JSON.stringify(release.manifest, null, 2)}\n`, "utf8");
    const scan = runScanner(release.manifest, releaseSelection, manifestPath);
    const scanSummary = JSON.parse(scan.stdout || "{}") as { spoolPath?: string };
    const spoolDirectory = scanSummary.spoolPath ? resolve(scanSummary.spoolPath) : join(runDirectory, "spool");

    const batchFilesPromise = (await import("node:fs/promises")).readdir(spoolDirectory).then((names) => names.filter(isBatchFile).sort());
    for (const name of await batchFilesPromise) await call("submit_scan_batch", { architectureScope: scope, batch: JSON.parse(await readFile(join(spoolDirectory, name), "utf8")) });
    const finalization = JSON.parse(await readFile(join(spoolDirectory, "finalization.json"), "utf8"));
    const finalized = await call("finalize_knowledge_scan", { architectureScope: scope, sessionId: descriptor.sessionId, finalization });
    if (finalized.status !== "READY_FOR_ANALYSIS") throw new Error(`SCAN_FINALIZATION_BLOCKED:${finalized.status}`);

    if (process.env.SPECFORGE_SEMANTIC_PROVIDER?.trim().toLowerCase() === "mock") {
      const reviewResult = await submitMockSemanticCandidates(descriptor.sessionId, scannerReleaseId, descriptor.policyReceipt, spoolDirectory, await batchFilesPromise);
      process.stdout.write(`${JSON.stringify({ status: "GOVERNED_SCAN_READY_FOR_REVIEW", sessionId: descriptor.sessionId, runDirectory, scannerReleaseId, scan: scanSummary, finalized, ...reviewResult }, null, 2)}\n`);
      return;
    }
    process.stdout.write(`${JSON.stringify({ status: "GOVERNED_SCAN_READY_FOR_AGENT_ANALYSIS", sessionId: descriptor.sessionId, runDirectory, scannerReleaseId, scan: scanSummary, finalized }, null, 2)}\n`);
  } finally {
    await client.close();
    await transport.close();
  }
}

async function submitMockSemanticCandidates(sessionId: string, scannerReleaseId: string, policyReceipt: { semanticPromptPackDigest: string; effectivePolicyDigest: string }, spoolDirectory: string, batchFiles: string[]) {
  const { contentDigest, factTypeForAssetFamily, generateSemanticCandidates, semanticEvidenceClusterDigest } = await import("@specforge/core");
  const observations = [] as Array<Record<string, unknown>>;
  for (const name of batchFiles) {
    const batch = JSON.parse(await readFile(join(spoolDirectory, name), "utf8")) as { observations: Array<Record<string, unknown>> };
    for (const observation of batch.observations) {
      const sourceObservationId = `source:${sessionId}:${String(observation.id)}`;
      const source = observation.source as Record<string, unknown>;
      observations.push({ id: sourceObservationId, sourceObservationId, observationType: observation.observationType, sourcePath: String(source.path ?? "unknown"), payload: observation.payload, normalizedDigest: observation.normalizedDigest });
    }
  }
  const generated = await generateSemanticCandidates({ observations: observations as never[], provider: "mock" });
  const normalizedDigests = new Map(observations.map((observation) => [String(observation.sourceObservationId), String(observation.normalizedDigest)]));
  const drafts = generated.content.map((candidate) => ({ candidate, assetFamily: mockAssetFamily(candidate.factType) }));
  let previousBatchDigest: string | undefined;
  for (let offset = 0, sequence = 0; offset < drafts.length; offset += 100, sequence += 1) {
    const pageDrafts = drafts.slice(offset, offset + 100);
    const clusterBase = {
      id: `cluster:${sessionId}:${sequence}`,
      architectureScope: scope,
      domainHint: "repository",
      observationIds: pageDrafts.map(({ candidate }) => candidate.sourceObservationId),
      evidenceTypes: ["source-code", "documentation"] as const,
      tokenEstimate: Math.max(1, pageDrafts.length * 100)
    };
    const cluster = { ...clusterBase, evidenceTypes: [...clusterBase.evidenceTypes], clusterDigest: semanticEvidenceClusterDigest({ ...clusterBase, evidenceTypes: [...clusterBase.evidenceTypes] }) };
    const page = pageDrafts.map(({ candidate, assetFamily }) => {
      const value = candidate.value as Record<string, unknown>;
      const summary = record(value.summary);
      const canonicalContent = record(value.canonicalContent) ?? {
        name: candidate.semanticIdentity,
        description: String(value.canonicalDescription ?? summary?.en ?? "Mock semantic candidate requires review.")
      };
      const localizedContent = record(value.localizedContent)?.zh && typeof record(value.localizedContent)?.zh === "object"
        ? record(value.localizedContent)!.zh as Record<string, unknown>
        : {
          name: candidate.semanticIdentity,
          description: String(value.localizedDescription ?? summary?.zh ?? "Mock 语义候选需要审核。")
        };
      const evidenceRefs = [`source-observation:${candidate.sourceObservationId}`, `scanner-release:${scannerReleaseId}`];
      return {
        ...candidate,
        value: { ...value, canonicalContent, localizedContent: { zh: localizedContent } },
        normalizedDigest: contentDigest({ semanticIdentity: candidate.semanticIdentity, source: normalizedDigests.get(candidate.sourceObservationId) ?? "" }),
        factType: factTypeForAssetFamily[assetFamily],
        matchingEvidence: evidenceRefs,
        evidenceRefs,
        sourceObservationIds: [candidate.sourceObservationId],
        domainCluster: candidate.semanticIdentity.split(".")[1] ?? "repository",
        identityDecision: "UNMATCHED" as const,
        assetFamily,
        promptPackDigest: policyReceipt.semanticPromptPackDigest,
        policyDigest: policyReceipt.effectivePolicyDigest,
        clusterId: cluster.id,
        evidenceTypes: [...cluster.evidenceTypes],
        canonicalContent,
        localizedContent: { zh: localizedContent }
      };
    });
    const batch = {
      sessionId,
      sequence,
      ...(previousBatchDigest ? { previousBatchDigest } : {}),
      complete: offset + page.length === drafts.length,
      provenance: { agent: "specforge-local-governed-scan", model: "MockAIProvider", tool: "run-governed-repository-scan", runId },
      clusters: [cluster],
      candidates: page
    };
    const receipt = await call("submit_semantic_candidate_batch", { architectureScope: scope, batch });
    previousBatchDigest = receipt.acceptedBatchDigest;
  }
  const reviewBundles = await call("assemble_knowledge_review_bundles", { architectureScope: scope, sessionId });
  return { candidateCount: drafts.length, reviewBundles };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function mockAssetFamily(factType: string) {
  if (factType === "api-contract") return "api" as const;
  if (factType === "event-contract") return "event" as const;
  if (factType === "data-model") return "dataModel" as const;
  if (factType === "business-rule") return "businessRule" as const;
  if (factType === "state-machine") return "stateMachine" as const;
  if (factType === "architecture-decision") return "adr" as const;
  return "domain" as const;
}

function runScanner(manifest: Record<string, any>, selection: ReleaseSelection, manifestPath: string) {
  if ((manifest.artifactKind ?? "NATIVE_BINARY") === "NATIVE_BINARY") {
    if (!selection.trustPath) throw new Error("SPECFORGE_SCANNER_TRUST_PATH_REQUIRED");
    const artifactPath = fileURLToPath(new URL(manifest.artifact.uri));
    const result = spawnSync(artifactPath, [
      "scan", "--repository-id", repositoryId, "--release", manifestPath, "--session", sessionPath,
      "--trust", selection.trustPath, "--spool", runDirectory, "--artifact", artifactPath
    ], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (result.status !== 0) throw new Error(`SCANNER_FAILED:${result.stderr || result.stdout}`);
    return result;
  }
  const artifactDirectory = fileURLToPath(new URL(`${manifest.artifact.uri.endsWith("/") ? manifest.artifact.uri : `${manifest.artifact.uri}/`}`));
  const scannerPath = resolve(artifactDirectory, manifest.entrypoint);
  const spoolDirectory = join(runDirectory, "spool");
  const result = spawnSync(process.execPath, [scannerPath, "--repository", root, "--session", sessionPath, "--output", spoolDirectory], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`SCANNER_FAILED:${result.stderr || result.stdout}`);
  return result;
}

function nativeSnapshot(manifest: Record<string, any>) {
  const artifactPath = fileURLToPath(new URL(manifest.artifact.uri));
  const result = spawnSync(artifactPath, ["scan", "snapshot", "--repository-id", repositoryId, "--allow-dirty", "true", "--max-source-file-bytes", "10485760", "--ignore-patterns", repositoryIgnorePatterns.join(",")], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`SCANNER_SNAPSHOT_FAILED:${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

type ReleaseSelection = {
  releaseId: string;
  localManifest?: Record<string, any>;
  trustPath?: string;
};

async function resolveReleaseSelection(): Promise<ReleaseSelection> {
  const activePath = process.env.SPECFORGE_SCANNER_ACTIVE_RELEASE?.trim() || join(homedir(), ".specforge", "scanner", "active-release.json");
  let active: Record<string, string> = {};
  try {
    active = JSON.parse(await readFile(activePath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const releaseId = process.env.SPECFORGE_SCANNER_RELEASE_ID?.trim() || active.preferredReleaseId;
  if (!releaseId) throw new Error("SPECFORGE_SCANNER_RELEASE_ID_REQUIRED");
  const explicitManifestPath = process.env.SPECFORGE_SCANNER_RELEASE_MANIFEST_PATH?.trim();
  const candidates = [explicitManifestPath, active.nativeManifestPath, active.portableManifestPath].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const manifest = JSON.parse(await readFile(resolve(candidate), "utf8")) as Record<string, any>;
    if (manifest.releaseId === releaseId) {
      return { releaseId, localManifest: manifest, trustPath: process.env.SPECFORGE_SCANNER_TRUST_PATH?.trim() || active.trustPath };
    }
  }
  return { releaseId, trustPath: process.env.SPECFORGE_SCANNER_TRUST_PATH?.trim() || active.trustPath };
}

async function call(name: string, arguments_: Record<string, unknown>): Promise<any> {
  if (!activeClient) throw new Error("MCP_CLIENT_NOT_READY");
  const result = await activeClient.callTool({ name, arguments: arguments_ });
  const text = result.content?.map((item) => item.text ?? "").join("") ?? "";
  if (result.isError) throw new Error(`${name}:${text}`);
  return text ? JSON.parse(text) : {};
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function isBatchFile(name: string): boolean {
  return /^batch-\d+\.json$/u.test(name) || /^\d{8}-[0-9a-f]{64}\.json$/u.test(name);
}

function snapshotIdentity() {
  let commit = "WORKTREE";
  try { commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim() || commit; } catch { /* dirty or non-git workspaces are still explicitly allowed */ }
  const snapshot = { repositoryId, snapshotKind: "DIRTY_MANIFEST", commit };
  return { ...snapshot, snapshotDigest: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex") };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
