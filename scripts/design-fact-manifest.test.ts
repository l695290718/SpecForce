import { existsSync } from "node:fs";
import manifest from "../docs/design-facts/baseline-manifest.json";
import { expect, it } from "vitest";

const expectedScope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

it("maps every baseline decision to a complete repository and MCP record", () => {
  expect(manifest.decisions).toHaveLength(8);
  expect(new Set(manifest.decisions.map((decision) => decision.id)).size).toBe(8);
  expect(new Set(manifest.decisions.map((decision) => decision.mcpAdrId)).size).toBe(8);

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

it("records the blocked federated sync fact with complete English and Chinese overlays", () => {
  const decision = manifest.decisions.find((item) => item.mcpAdrId === "adr-federated-design-fact-synchronization") as typeof manifest.decisions[number] & {
    localizedContent?: { en?: Record<string, unknown>; zh?: Record<string, unknown> };
  };
  expect(decision.localizedContent?.en).toEqual(expect.objectContaining({ owner: expect.any(String), reason: expect.any(String), retryTrigger: expect.any(String) }));
  expect(decision.localizedContent?.zh).toEqual(expect.objectContaining({ owner: expect.any(String), reason: expect.any(String), retryTrigger: expect.any(String) }));
});
