import { existsSync } from "node:fs";
import manifest from "../docs/design-facts/baseline-manifest.json";
import { expect, it } from "vitest";

const expectedScope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

it("maps every baseline decision to a complete repository and MCP record", () => {
  expect(manifest.decisions).toHaveLength(30);
  expect(new Set(manifest.decisions.map((decision) => decision.id)).size).toBe(30);
  expect(new Set(manifest.decisions.map((decision) => decision.mcpAdrId)).size).toBe(30);
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

it("includes the evidence-driven requirement assessment center baseline", () => {
  const decision = manifest.decisions.find((item) => item.mcpAdrId === "adr-requirement-assessment-center");
  expect(decision?.proposalId).toBe("proposal-requirement-assessment-center");
  expect(decision?.contextPackId).toBe("context-pack-requirement-assessment-center");
  expect(decision?.scope).toEqual(expectedScope);
  expect(decision?.managedAssets?.map((managed) => managed.asset.id)).toEqual([
    "api-specforge-requirement-assessment",
    "data-specforge-requirement-assessment",
    "data-specforge-assessment-evidence-snapshot",
    "data-specforge-model-profile",
    "data-specforge-agent-execution-profile",
    "rule-specforge-assessment-acceptance",
    "quality-specforge-assessment-confidence"
  ]);
  expect(decision?.managedRelationships).toEqual(expect.arrayContaining([
    expect.objectContaining({ sourceId: "api-specforge-requirement-assessment", targetId: "data-specforge-requirement-assessment", relationType: "WRITES" }),
    expect.objectContaining({ sourceId: "api-specforge-requirement-assessment", targetId: "data-specforge-assessment-evidence-snapshot", relationType: "READS" }),
    expect.objectContaining({ sourceId: "rule-specforge-assessment-acceptance", targetId: "quality-specforge-assessment-confidence", relationType: "GOVERNS" })
  ]));
  expect(decision?.managedAssets?.every((managed) => {
    const localized = managed.asset.localizedContent as { en?: { name?: string; description?: string }; zh?: { name?: string; description?: string } };
    return localized.en?.name && localized.en.description && localized.zh?.name && localized.zh.description;
  })).toBe(true);
});

it("includes integration contract verification states in the baseline", () => {
  const decision = manifest.decisions.find((item) => item.mcpAdrId === "adr-integration-verification-states");
  expect(decision?.repositoryAdr).toBe("docs/adr/0041-integration-verification-states.md");
  expect(decision?.proposalId).toBe("proposal-integration-contract-verification-states");
  expect(decision?.contextPackId).toBe("context-pack-integration-contract-verification-states");
  expect(decision?.scope).toEqual(expectedScope);
  expect(decision?.status).toContain("implemented");
  expect(decision?.localizedContent?.en.decision).toContain("ATTESTED");
  expect(decision?.localizedContent?.zh.decision).toContain("ATTESTED");
  expect(decision?.evidence).toHaveLength(10);
});

it("records the scoped Data Model ER workspace without claiming MCP or browser completion", () => {
  const decision = manifest.decisions.find((item) => item.mcpAdrId === "adr-webgl-data-model-er-workspace");
  expect(decision?.repositoryAdr).toBe("docs/adr/0037-webgl-data-model-er-workspace.md");
  expect(decision?.proposalId).toBe("proposal-webgl-data-model-er-workspace");
  expect(decision?.contextPackId).toBe("ctx-webgl-data-model-er-workspace");
  expect(decision?.scope).toEqual(expectedScope);
  expect(decision?.status).toContain("MCP synchronization");
  expect(decision?.localizedContent?.en.decision).toContain("semantic fallback");
  expect(decision?.localizedContent?.zh.decision).toContain("语义回退");
  expect(decision?.managedAssets?.some((managed) => managed.asset.id === "api-specforge-data-model-graph-query")).toBe(true);
  expect(decision?.managedRelationships).toEqual(expect.arrayContaining([
    expect.objectContaining({ sourceId: "adr-webgl-data-model-er-workspace", targetId: "data-specforge-assets", relationType: "DECIDES" }),
    expect.objectContaining({ sourceId: "proposal-webgl-data-model-er-workspace", targetId: "api-specforge-data-model-graph-query", relationType: "IMPACTS" })
  ]));
});

it("includes Agent-driven legacy baseline discovery in the baseline", () => {
  const decision = manifest.decisions.find((item) => item.mcpAdrId === "adr-agent-driven-legacy-baseline-discovery");
  expect(decision?.proposalId).toBe("proposal-agent-driven-legacy-baseline-discovery");
  expect(decision?.contextPackId).toBe("context-pack-agent-driven-legacy-baseline-discovery");
  expect(decision?.managedAssets?.map((managed) => managed.asset.id)).toEqual([
    "api-specforge-scanner-release-contract",
    "data-specforge-scan-session",
    "data-specforge-scan-batch",
    "data-specforge-source-observation-v2",
    "rule-specforge-knowledge-risk-policy",
    "rule-specforge-knowledge-promotion-transaction",
    "api-specforge-knowledge-baseline-publication"
  ]);
  expect(decision?.managedRelationships?.every((relationship) => relationship.sourceId && relationship.targetId && relationship.relationType)).toBe(true);
  expect(decision?.managedAssets?.every((managed) => {
    const localized = managed.asset.localizedContent as { en?: { name?: string; description?: string }; zh?: { name?: string; description?: string } };
    return localized.en?.name && localized.en.description && localized.zh?.name && localized.zh.description;
  })).toBe(true);
});

it("includes unified 3A knowledge initialization in the baseline", () => {
  const decision = manifest.decisions.find((item) => item.mcpAdrId === "adr-unified-3a-knowledge-initialization");
  expect(decision?.proposalId).toBe("proposal-unified-3a-knowledge-initialization");
  expect(decision?.contextPackId).toBe("context-pack-unified-3a-knowledge-initialization");
  expect(decision?.status).toContain("Phase 1");
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

it("includes provider-neutral Agent bootstrap governance and its bounded context contracts", () => {
  const decision = manifest.decisions.find((item) => item.mcpAdrId === "adr-provider-neutral-agent-bootstrap-governance");
  expect(decision?.proposalId).toBe("proposal-agent-bootstrap-governance");
  expect(decision?.contextPackId).toBe("context-pack-agent-bootstrap-governance");
  expect(decision?.managedAssets?.map((managed) => managed.asset.id)).toEqual([
    "api-specforge-agent-bootstrap-context",
    "data-specforge-agent-bootstrap-envelope",
    "rule-specforge-agent-bootstrap-fail-closed"
  ]);
  expect(decision?.managedRelationships).toEqual(expect.arrayContaining([
    expect.objectContaining({ sourceId: "api-specforge-agent-bootstrap-context", targetId: "data-specforge-agent-bootstrap-envelope", relationType: "READS" }),
    expect.objectContaining({ sourceId: "rule-specforge-agent-bootstrap-fail-closed", targetId: "api-specforge-agent-bootstrap-context", relationType: "GOVERNS" })
  ]));
});

it("includes the parallel governance workstreams decision", () => {
  const decision = manifest.decisions.find((item) => item.mcpAdrId === "adr-parallel-governance-workstreams");
  expect(decision?.proposalId).toBe("proposal-parallel-governance-workstreams");
  expect(decision?.contextPackId).toBe("context-pack-parallel-governance-workstreams");
  expect(decision?.status).toContain("ScopedPrincipal");
});

it("includes the implemented 3A architecture workspace and its typed design facts", () => {
  const decision = manifest.decisions.find((item) => item.mcpAdrId === "adr-3a-architecture-navigation-workspace");
  expect(decision?.proposalId).toBe("proposal-3a-architecture-navigation-workspace");
  expect(decision?.proposalStatus).toBe("implemented");
  expect(decision?.contextPackId).toBe("ctx-3a-architecture-navigation-workspace");
  expect(decision?.managedAssets?.map((managed) => managed.asset.id)).toEqual([
    "api-specforge-3a-projection-build",
    "api-specforge-3a-architecture-query",
    "data-specforge-3a-projection-read-model",
    "rule-specforge-3a-projection-publication"
  ]);
  expect(decision?.managedRelationships).toEqual(expect.arrayContaining([
    expect.objectContaining({ sourceId: "api-specforge-3a-projection-build", targetId: "data-specforge-3a-projection-read-model", relationType: "WRITES" }),
    expect.objectContaining({ sourceId: "api-specforge-3a-architecture-query", targetId: "data-specforge-3a-projection-read-model", relationType: "READS" }),
    expect.objectContaining({ sourceId: "rule-specforge-3a-projection-publication", targetId: "api-specforge-3a-projection-build", relationType: "GOVERNS" })
  ]));
  expect(decision?.managedAssets?.every((managed) => {
    const localized = managed.asset.localizedContent as { en?: { name?: string; description?: string }; zh?: { name?: string; description?: string } };
    return localized.en?.name && localized.en.description && localized.zh?.name && localized.zh.description;
  })).toBe(true);
});

it("includes the implemented scalable 3A exploration design and bounded query contract", () => {
  const decision = manifest.decisions.find((item) => item.mcpAdrId === "adr-scalable-3a-exploration");
  expect(decision?.proposalId).toBe("proposal-scalable-3a-exploration");
  expect(decision?.proposalStatus).toBe("implemented");
  expect(decision?.contextPackId).toBe("ctx-scalable-3a-exploration");
  expect(decision?.status).toContain("Implemented and locally accepted");
  expect(decision?.relatedAssetIds).toEqual([
    "api-specforge-3a-architecture-query",
    "data-specforge-3a-projection-read-model",
    "adr-3a-architecture-navigation-workspace"
  ]);
  expect(decision?.managedRelationships).toEqual(expect.arrayContaining([
    expect.objectContaining({ sourceId: "proposal-scalable-3a-exploration", targetId: "api-specforge-3a-architecture-query", relationType: "IMPACTS" }),
    expect.objectContaining({ sourceId: "proposal-scalable-3a-exploration", targetId: "data-specforge-3a-projection-read-model", relationType: "IMPACTS" })
  ]));
  const queryAsset = manifest.decisions
    .find((item) => item.mcpAdrId === "adr-3a-architecture-navigation-workspace")
    ?.managedAssets?.find((managed) => managed.asset.id === "api-specforge-3a-architecture-query")?.asset;
  expect(queryAsset?.requestSchema).toEqual(expect.objectContaining({
    search: expect.objectContaining({ layer: "BIZ|SYS|TECH", limit: "1..50, default 20", cursor: "opaque optional token" }),
    trace: expect.objectContaining({ direction: "upstream|downstream|both", relationTypes: "string[] optional", layers: "BIZ|SYS|TECH[] optional", continuation: "opaque optional token" })
  }));
  expect(queryAsset?.localizedContent?.en.description).toContain("per-layer cursor pagination");
  expect(queryAsset?.localizedContent?.zh.description).toContain("按层游标分页");
  expect(decision?.evidence).toEqual(expect.arrayContaining([
    expect.objectContaining({ command: expect.stringContaining("workspace-loader.test.ts") }),
    expect.objectContaining({ command: expect.stringContaining("next build --no-lint --experimental-app-only") }),
    expect.objectContaining({ command: expect.stringContaining("In-app browser acceptance") })
  ]));
});

  it("records the implemented WebGL 3A graph and impact-analysis design with exact evidence", () => {
  const decision = manifest.decisions.find((item) => item.mcpAdrId === "adr-webgl-3a-graph-exploration");
  expect(decision?.proposalId).toBe("proposal-webgl-3a-graph-exploration");
  expect(decision?.proposalStatus).toBe("implemented");
  expect(decision?.contextPackId).toBe("ctx-webgl-3a-graph-exploration");
  expect(decision?.status).toBe("Implemented in source/build; fresh browser visual acceptance blocked by existing in-app tab snapshot");
  expect(decision?.scope).toEqual(expectedScope);
  expect(decision?.relatedAssetIds).toEqual([
    "api-specforge-3a-architecture-query",
    "data-specforge-3a-projection-read-model",
    "adr-scalable-3a-exploration"
  ]);
  expect(decision?.managedRelationships).toEqual(expect.arrayContaining([
    expect.objectContaining({ sourceId: "proposal-webgl-3a-graph-exploration", targetId: "api-specforge-3a-architecture-query", relationType: "IMPACTS" }),
    expect.objectContaining({ sourceId: "proposal-webgl-3a-graph-exploration", targetId: "data-specforge-3a-projection-read-model", relationType: "IMPACTS" })
  ]));
  expect(decision?.reason).toContain("Sigma.js, Graphology, and WebGL");
  expect(decision?.retryTrigger).toContain("new exact-Scope");
});

it("includes the single-host Docker deployment decision in the baseline", () => {
  const decision = manifest.decisions.find((item) => item.mcpAdrId === "adr-single-host-docker-compose-deployment");
  expect(decision?.proposalId).toBe("proposal-single-host-docker-deployment");
  expect(decision?.contextPackId).toBe("context-pack-single-host-docker-deployment");
  expect(decision?.evidence).toHaveLength(13);
});

it("records the governed graph-first 3A workspace separately from assertion analysis", () => {
  const decision = manifest.decisions.find((item) => item.mcpAdrId === "adr-readable-3a-architecture-mapping");
  expect(decision?.proposalId).toBe("proposal-readable-3a-architecture-mapping");
  expect(decision?.proposalStatus).toBe("implemented");
  expect(decision?.contextPackId).toBe("ctx-readable-3a-architecture-mapping");
  expect(decision?.status).toContain("graph-first 3A workspace");
  expect(decision?.relatedAssetIds).toEqual([
    "api-specforge-3a-architecture-query",
    "data-specforge-3a-projection-read-model",
    "adr-webgl-3a-graph-exploration"
  ]);
  expect(decision?.reason).toContain("eight governed units, 42 direct members, 307 covered assets, and six mappings");
  expect(decision?.localizedContent?.en.decision).toContain("load exact-Scope direct unit members plus bounded relationships in Overview");
  expect(decision?.localizedContent?.zh.decision).toContain("按需展开精确 Scope 的单元成员");
  expect(decision?.managedRelationships).toEqual(expect.arrayContaining([
    expect.objectContaining({ sourceId: "proposal-readable-3a-architecture-mapping", targetId: "api-specforge-3a-architecture-query", relationType: "IMPACTS" }),
    expect.objectContaining({ sourceId: "proposal-readable-3a-architecture-mapping", targetId: "data-specforge-3a-projection-read-model", relationType: "IMPACTS" })
  ]));
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
