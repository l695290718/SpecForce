import { existsSync } from "node:fs";
import manifest from "../docs/design-facts/baseline-manifest.json";
import { expect, it } from "vitest";

const expectedScope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

it("maps every baseline decision to a complete repository and MCP record", () => {
  expect(manifest.decisions).toHaveLength(10);
  expect(new Set(manifest.decisions.map((decision) => decision.id)).size).toBe(10);
  expect(new Set(manifest.decisions.map((decision) => decision.mcpAdrId)).size).toBe(10);

  for (const decision of manifest.decisions) {
    expect(decision.id).toMatch(/^adr-/);
    expect(decision.repositoryAdr).toMatch(/^docs\/adr\/\d{4}-.+\.md$/);
    expect(existsSync(decision.repositoryAdr)).toBe(true);
    expect(decision.mcpAdrId).toMatch(/^adr-/);
    expect(decision.scope).toEqual(expectedScope);
    expect(decision.proposalId).toMatch(/^proposal-/);
    expect(decision.contextPackId).toMatch(/^(ctx|context-pack)-/);
    expect(decision.relatedAssetIds.length).toBeGreaterThan(0);
    expect(decision.evidence.length).toBeGreaterThan(0);
    expect(decision.evidence.every((entry) => entry.command.length > 0 && entry.result.length > 0)).toBe(true);
  }
});

it("includes federated design-fact governance in the baseline", () => {
  expect(manifest.decisions.some((decision) => decision.mcpAdrId === "adr-federated-design-fact-synchronization")).toBe(true);
});

it("includes the single-host Docker deployment decision in the baseline", () => {
  const decision = manifest.decisions.find((item) => item.mcpAdrId === "adr-single-host-docker-compose-deployment");
  expect(decision?.proposalId).toBe("proposal-single-host-docker-deployment");
  expect(decision?.contextPackId).toBe("context-pack-single-host-docker-deployment");
  expect(decision?.evidence).toHaveLength(3);
});

it("includes the scope-safe architecture overview decision with bilingual governance metadata", () => {
  const decision = manifest.decisions.find((item) => item.mcpAdrId === "adr-architecture-overview-home");
  expect(decision?.proposalId).toBe("proposal-architecture-overview-home");
  expect(decision?.contextPackId).toBe("ctx-architecture-overview-home");
  expect(decision?.relatedAssetIds).toEqual(["data-specforge-assets", "adr-design-fact-dual-record-governance"]);
  expect(decision?.localizedContent?.en.decision).toContain("static bilingual architecture orientation");
  expect(decision?.localizedContent?.zh.decision).toContain("静态双语架构定位页");
  expect(decision?.evidence).toHaveLength(2);
});

it("records the verified federated sync fact with canonical metadata and valid bilingual ADR overlays", () => {
  const decision = manifest.decisions.find((item) => item.mcpAdrId === "adr-federated-design-fact-synchronization") as typeof manifest.decisions[number];
  expect(decision.status).toBe("MCP synchronized and read back");
  expect(decision.owner).toBe("SpecForge Architecture");
  expect(decision.reason).toContain("localhost:5433");
  expect(decision.retryTrigger).toContain("re-run design-facts:sync");
  expect(decision.auditFailureCode).toBe("FEDERATION_TOOL_ERROR");
  expect(decision.auditDiagnosticReference).toContain("64-hex SHA-256");
  expect(decision.auditSecurityContract).toContain("raw exceptions");
  expect(decision.localizedContent?.en).toEqual(expect.objectContaining({
    decision: expect.stringContaining("FEDERATION_TOOL_ERROR"),
    constraints: expect.arrayContaining([expect.stringContaining("MCP synchronization and read-back are verified")])
  }));
  expect(decision.localizedContent?.zh).toEqual(expect.objectContaining({
    decision: expect.stringContaining("FEDERATION_TOOL_ERROR"),
    constraints: expect.arrayContaining([expect.stringContaining("MCP 同步与回读已在")])
  }));
  expect(Object.keys(decision.localizedContent?.en ?? {}).sort()).toEqual(["constraints", "decision"]);
  expect(Object.keys(decision.localizedContent?.zh ?? {}).sort()).toEqual(["constraints", "decision"]);
  expect(decision.evidence).toHaveLength(6);
  expect(decision.evidence[5]?.command).toContain("apps\\mcp-server\\src\\federation\\tools.test.ts");
  expect(decision.evidence[5]?.result).toContain("raw exception and credential text are absent");
});
