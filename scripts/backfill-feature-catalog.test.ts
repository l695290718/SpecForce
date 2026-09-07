import { describe, expect, it } from "vitest";
import type { SystemKnowledgeAsset } from "../apps/mcp-server/src/knowledge-readiness/read";
import {
  parseFeatureCatalogBackfillArgs,
  runFeatureCatalogBackfill,
  type FeatureCatalogBackfillOptions,
  type FeatureCatalogMcpClient
} from "./backfill-feature-catalog";

const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};
const options: FeatureCatalogBackfillOptions = { architectureScope: scope, mode: "dry-run", sessionId: "session-feature-backfill", pageSize: 200, now: "2026-09-07T00:00:00.000Z" };

function asset(id: string, type: string): SystemKnowledgeAsset {
  return { id, type, name: id, summary: id, updatedAt: "2026-09-07T00:00:00.000Z", contentDigest: `${id}-digest`, architectureScope: scope };
}

function text(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function fakeClient(responses: Record<string, unknown[]>): { client: FeatureCatalogMcpClient; calls: Array<{ name: string; arguments: Record<string, unknown> }> } {
  const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  return {
    calls,
    client: {
      async callTool(call) {
        calls.push(call);
        const response = responses[call.name]?.shift();
        if (!response) throw new Error(`Unexpected tool: ${call.name}`);
        return text(response);
      }
    }
  };
}

describe("runFeatureCatalogBackfill", () => {
  it("evaluates readiness before receipt-bound pagination and sends a dry-run atomic change set", async () => {
    const fake = fakeClient({
      evaluate_system_knowledge_readiness: [{ accessDecision: "ALLOW", receiptId: "readiness-receipt" }],
      read_system_knowledge: [
        { accessDecision: "ALLOW", assets: [asset("api-catalog", "api")], relationships: [], nextCursor: "next" },
        { accessDecision: "ALLOW", assets: [asset("model-catalog", "dataModel")], relationships: [] }
      ],
      apply_feature_change_set: [{ dryRun: true, changedAssetIds: [] }]
    });

    const report = await runFeatureCatalogBackfill(fake.client, options, { writePlan: async (plan) => `memory:${plan.digest}` });

    expect(fake.calls.map((call) => call.name)).toEqual([
      "evaluate_system_knowledge_readiness",
      "read_system_knowledge",
      "read_system_knowledge",
      "apply_feature_change_set"
    ]);
    expect(fake.calls[1]?.arguments).toMatchObject({ receiptId: "readiness-receipt", pageSize: 200 });
    expect(fake.calls[2]?.arguments).toMatchObject({ receiptId: "readiness-receipt", cursor: "next" });
    expect(fake.calls.at(-1)?.arguments).toMatchObject({ dryRun: true, designChangeSessionId: options.sessionId });
    expect(report).toMatchObject({ assetsRead: 2, featureAssets: 10, featureRelationships: 4 });
  });

  it("does not read or write when the readiness gate denies the Scope", async () => {
    const fake = fakeClient({ evaluate_system_knowledge_readiness: [{ accessDecision: "DENY", reasonCodes: ["KNOWLEDGE_SOURCE_NOT_CONFIGURED"] }] });

    await expect(runFeatureCatalogBackfill(fake.client, options)).rejects.toThrow("FEATURE_CATALOG_READINESS_DENIED:KNOWLEDGE_SOURCE_NOT_CONFIGURED");
    expect(fake.calls.map((call) => call.name)).toEqual(["evaluate_system_knowledge_readiness"]);
  });

  it("uses one deterministic idempotency key for equivalent apply inputs", async () => {
    const responseSet = () => ({
      evaluate_system_knowledge_readiness: [{ accessDecision: "ALLOW", receiptId: "readiness-receipt" }],
      read_system_knowledge: [{ accessDecision: "ALLOW", assets: [asset("api-catalog", "api")], relationships: [] }],
      apply_feature_change_set: [{ dryRun: false, changedAssetIds: [] }]
    });
    const first = fakeClient(responseSet());
    const second = fakeClient(responseSet());

    await runFeatureCatalogBackfill(first.client, { ...options, mode: "apply" });
    await runFeatureCatalogBackfill(second.client, { ...options, mode: "apply" });

    expect(first.calls.at(-1)?.arguments.idempotencyKey).toBe(second.calls.at(-1)?.arguments.idempotencyKey);
    expect(first.calls.at(-1)?.arguments).toMatchObject({ dryRun: false });
  });

  it("requires an exact Scope and one execution mode from the CLI", () => {
    expect(parseFeatureCatalogBackfillArgs([
      "--dry-run", "--session", "session-a", "--application-service", scope.applicationServiceId, "--scope-path", scope.scopePath
    ])).toMatchObject({ architectureScope: scope, mode: "dry-run", sessionId: "session-a" });
    expect(() => parseFeatureCatalogBackfillArgs(["--apply", "--dry-run", "--session", "session-a", "--application-service", scope.applicationServiceId, "--scope-path", scope.scopePath])).toThrow("Choose only one");
  });
});
