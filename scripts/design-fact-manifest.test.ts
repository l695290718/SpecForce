import { existsSync } from "node:fs";
import manifest from "../docs/design-facts/baseline-manifest.json";
import { expect, it } from "vitest";

const expectedScope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

it("maps every baseline decision to a complete repository and MCP record", () => {
  expect(manifest.decisions).toHaveLength(16);
  expect(new Set(manifest.decisions.map((decision) => decision.id)).size).toBe(16);
  expect(new Set(manifest.decisions.map((decision) => decision.mcpAdrId)).size).toBe(16);
  const proposalByContextPack = new Map<string, string>();

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
    const existingProposal = proposalByContextPack.get(decision.contextPackId);
    expect(existingProposal === undefined || existingProposal === decision.proposalId).toBe(true);
    proposalByContextPack.set(decision.contextPackId, decision.proposalId);
  }
});

it("includes federated design-fact governance in the baseline", () => {
  expect(manifest.decisions.some((decision) => decision.mcpAdrId === "adr-federated-design-fact-synchronization")).toBe(true);
});

it("includes Agent-driven legacy baseline discovery in the baseline", () => {
  expect(manifest.decisions.some((decision) => decision.mcpAdrId === "adr-agent-driven-legacy-baseline-discovery")).toBe(true);
});

it("includes unified 3A knowledge initialization in the baseline", () => {
  const decision = manifest.decisions.find((item) => item.mcpAdrId === "adr-unified-3a-knowledge-initialization");
  expect(decision?.proposalId).toBe("proposal-unified-3a-knowledge-initialization");
  expect(decision?.contextPackId).toBe("context-pack-unified-3a-knowledge-initialization");
  expect(decision?.status).toContain("phase 1 implemented");
});

it("includes design-context preflight governance in the baseline", () => {
  expect(manifest.decisions.some((decision) => decision.mcpAdrId === "adr-design-context-preflight-gate")).toBe(true);
});

it("includes the local Git Hook change-attestation decision", () => {
  const decision = manifest.decisions.find((item) => item.mcpAdrId === "adr-local-git-hook-change-attestation");
  expect(decision?.proposalId).toBe("proposal-local-git-hook-change-attestation");
  expect(decision?.contextPackId).toBe("context-pack-local-git-hook-change-attestation");
  expect(decision?.status).toContain("Local enforcement increment implemented");
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
  expect(decision?.evidence).toEqual(expect.arrayContaining([
    expect.objectContaining({
      command: ".\\node_modules\\.bin\\vitest.cmd run --root . --exclude \".worktrees/**\" --exclude \".pnpm-store/**\" apps/web/lib/__tests__/overview.test.ts scripts/design-fact-manifest.test.ts",
      result: "Exited 0: 2 test files and 17 tests passed."
    }),
    expect.objectContaining({
      command: "pnpm --filter @specforge/web lint",
      result: expect.stringContaining("Exited 0")
    }),
    expect.objectContaining({
      command: expect.stringContaining("Bundled Playwright browser inspection"),
      result: expect.stringContaining("stage 6 remained directly before stages 7 and 8")
    }),
    expect.objectContaining({
      command: expect.stringContaining("Bundled Playwright reduced-motion inspection"),
      result: expect.stringContaining("window.matchMedia('(prefers-reduced-motion: reduce)').matches was true")
    }),
    expect.objectContaining({
      command: "$env:DATABASE_URL='postgresql://specforge:local-deployment-verification-only@localhost:15433/specforge_canonical?schema=public'; pnpm design-facts:sync",
      result: expect.stringContaining("Exit code 0")
    }),
    expect.objectContaining({
      command: "$env:DATABASE_URL='postgresql://specforge:local-deployment-verification-only@localhost:15433/specforge_canonical?schema=public'; pnpm design-facts:check",
      result: expect.stringContaining("exit code 0")
    })
  ]));
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
