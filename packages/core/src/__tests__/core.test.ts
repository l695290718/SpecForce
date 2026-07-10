import { describe, expect, it } from "vitest";
import {
  analyzeProposalImpact,
  buildAssetGraph,
  generateContextPack,
  renderAssetSummary,
  runGovernanceChecks
} from "../index";

describe("SpecForge core services", () => {
  it("generates a context pack with all required markdown sections", async () => {
    const pack = await generateContextPack("proposal-partial-refund");

    expect(pack.generatedMarkdown).toContain("# Agent Context Pack");
    expect(pack.generatedMarkdown).toContain("## 5. Impacted Assets");
    expect(pack.generatedMarkdown).toContain("## 17. Constraints and Do-not Rules");
    expect(pack.includedAssets.length).toBeGreaterThan(5);
  });

  it("runs API governance checks for idempotency, auth, errors, and compatibility", async () => {
    const results = await runGovernanceChecks("api", "api-create-refund");

    expect(results.map((result) => result.ruleCode)).toEqual(
      expect.arrayContaining(["API_IDEMPOTENCY", "API_AUTH", "API_ERROR_CODES", "API_COMPATIBILITY"])
    );
    expect(results.every((result) => result.status === "pass")).toBe(true);
  });

  it("builds a graph filtered by domain", async () => {
    const graph = await buildAssetGraph("domain-order");

    expect(graph.nodes.some((node) => node.id === "domain-order")).toBe(true);
    expect(graph.nodes.every((node) => node.domainId === "domain-order" || node.type === "domain" || node.type === "proposal" || node.type === "adr")).toBe(true);
    expect(graph.edges.length).toBeGreaterThan(5);
  });

  it("builds a graph filtered by asset type while keeping domain context", async () => {
    const graph = await buildAssetGraph("domain-order", "api");

    expect(graph.nodes.some((node) => node.id === "domain-order")).toBe(true);
    expect(graph.nodes.some((node) => node.id === "api-create-refund")).toBe(true);
    expect(graph.nodes.every((node) => node.type === "domain" || node.type === "api")).toBe(true);
    expect(graph.edges.every((edge) => graph.nodes.some((node) => node.id === edge.source) && graph.nodes.some((node) => node.id === edge.target))).toBe(true);
  });

  it("analyzes proposal impact across assets and risks", async () => {
    const impact = await analyzeProposalImpact("proposal-partial-refund");

    expect(impact.proposalId).toBe("proposal-partial-refund");
    expect(impact.impactedAssetCount).toBeGreaterThan(5);
    expect(impact.riskLevel).toBe("high");
    expect(impact.requiredContextPack).toBe(true);
  });

  it("renders an asset summary for agent-readable prompts", async () => {
    const summary = await renderAssetSummary("businessRule", "rule-refund-amount");

    expect(summary).toContain("部分退款金额不能超过可退金额");
    expect(summary).toContain("Severity: high");
  });
});
