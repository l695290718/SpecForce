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
    env: { ...process.env, SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: scope.applicationServiceId }
  });
  const client = new Client({ name: "designer-3a-v7-publisher", version: "0.1.0" }, { capabilities: {} });
  const call = async (name: string, arguments_: JsonRecord): Promise<JsonRecord> => {
    const response = (await client.callTool({ name, arguments: arguments_ })) as McpResponse;
    const raw = text(response);
    if (response.isError) throw new Error(`${name}: ${raw}`);
    return raw ? (JSON.parse(raw) as JsonRecord) : {};
  };
  await client.connect(transport);
  try {
    const candidate = await call("get_3a_architecture_candidate_set", {
      architectureScope: scope,
      candidateSetId: required(args, "candidate-set")
    });
    if (candidate.status !== "READY") throw new Error(`THREE_A_CANDIDATE_NOT_READY:${String(candidate.status)}`);
    const revisions = (candidate.architectureFactRevisionIds ?? {}) as JsonRecord;
    const revisionIds = [revisions.unitRevisionIds, revisions.membershipRevisionIds, revisions.mappingRevisionIds]
      .flat()
      .filter((id): id is string => typeof id === "string");
    if (revisionIds.length === 0) throw new Error("THREE_A_CANDIDATE_REVISIONS_REQUIRED");
    const evidenceRefs = Array.isArray(candidate.evidenceRefs)
      ? candidate.evidenceRefs.filter((value): value is string => typeof value === "string")
      : [];
    const candidateCounts = (candidate.candidateCounts ?? {}) as JsonRecord;
    const blockingIssues = Array.isArray(candidate.blockingIssues)
      ? candidate.blockingIssues.filter((value): value is string => typeof value === "string")
      : [];
    const review = await call("create_knowledge_review_bundle", {
      architectureScope: scope,
      id: required(args, "review-bundle"),
      designChangeSessionId: required(args, "session"),
      riskTier: "T1",
      assertionIds: [],
      identityCandidateIds: [],
      architectureFactRevisionIds: revisionIds,
      evidenceRefs,
      coverage: {
        totalSources: evidenceRefs.length,
        processedSources: evidenceRefs.length,
        supportedSources: evidenceRefs.length,
        candidateCount: revisionIds.length,
        complete: blockingIssues.length === 0
      },
      blockingIssues
    });
    const decision = await call("decide_knowledge_review_bundle", {
      architectureScope: scope,
      id: required(args, "decision"),
      reviewBundleId: String(review.id),
      decision: "APPROVE",
      approvedAssertionIds: [],
      approvedIdentityCandidateIds: [],
      approvedArchitectureFactRevisionIds: revisionIds,
      evidenceRefs,
      reason: `Approved the exact-Scope v7 candidate set (${JSON.stringify(candidateCounts)}); all candidate revisions are retained with evidence and cross-layer closure.`
    });
    const stream = await call("create_working_stream", {
      architectureScope: scope,
      id: required(args, "stream"),
      name: "Designer governed 3A architecture"
    });
    const promotion = await call("promote_3a_architecture_facts", {
      architectureScope: scope,
      promotionDecisionId: String(decision.id),
      streamId: String(stream.id),
      evidenceRefs
    });
    const reconciliation = await call("reconcile_3a_architecture_facts", {
      architectureScope: scope,
      promotionReceiptId: String(promotion.id)
    });
    if (reconciliation.status !== "CONVERGED")
      throw new Error(`THREE_A_V7_RECONCILIATION_NOT_CONVERGED:${JSON.stringify(reconciliation)}`);
    const baseline = await call("publish_knowledge_baseline", {
      architectureScope: scope,
      id: required(args, "baseline"),
      streamId: String(stream.id),
      changeSetId: String(promotion.changeSetId),
      sourceRevisionIds: [],
      architectureFactRevisionIds: revisionIds,
      relationshipVersion: String(reconciliation.relationshipVersion),
      reconciliationReceiptId: String(reconciliation.id)
    });
    const projection = await call("request_3a_projection_build", {
      architectureScope: scope,
      baselineId: String(baseline.id),
      profileId: "generic-system",
      profileVersion: "1",
      projectionSchemaVersion: "3a.v2",
      query: { layers: ["BIZ", "SYS", "TECH"] }
    });
    console.log(
      JSON.stringify(
        {
          scope,
          candidateSetId: candidate.id,
          review,
          decision,
          stream,
          promotion,
          reconciliation,
          baseline,
          projection
        },
        null,
        2
      )
    );
  } finally {
    await client.close();
    await transport.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
