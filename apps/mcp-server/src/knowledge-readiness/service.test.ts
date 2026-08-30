import { describe, expect, it } from "vitest";
import type { ScopedPrincipal } from "@specforge/core";
import { prisma } from "../persistence";
import { evaluateScopedKnowledgeReadiness, normalizeKnowledgeSelectors, principalGrantDigest, type KnowledgeReadRequest } from "./service";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const caller: ScopedPrincipal = {
  actorType: "agent",
  actorId: "readiness-service-test",
  subject: "readiness-service-test",
  tenantId: "local-development",
  authSource: "seed",
  permissions: ["knowledge:consume"],
  grants: [{ scopeId: scope.applicationServiceId, action: "read" }],
  decisionRef: "test-decision"
};
const request: KnowledgeReadRequest = {
  architectureScope: scope,
  knowledgeProfile: "ARCHITECTURE_OVERVIEW",
  selectors: [{ assetIds: ["asset-b", "asset-a", "asset-a"] }],
  purpose: "readiness-service-integration",
  locale: "en"
};

describe("scoped readiness service", () => {
  it("normalizes selectors and grants deterministically", () => {
    expect(normalizeKnowledgeSelectors([{ assetIds: ["b", "a", "a"] }, { assetTypes: ["api"] }])).toEqual([
      { assetIds: ["a", "b"] },
      { assetTypes: ["api"] }
    ]);
    expect(principalGrantDigest(caller)).toBe(principalGrantDigest({ ...caller, permissions: [...caller.permissions].reverse(), grants: [...caller.grants].reverse() }));
  });

  it.skipIf(!process.env.SPECFORGE_CONTINUOUS_INTEGRATION)("reuses within TTL and issues a new immutable receipt after TTL", async () => {
    const first = await evaluateScopedKnowledgeReadiness(prisma, request, caller, new Date("2026-08-30T10:00:00.000Z"));
    const second = await evaluateScopedKnowledgeReadiness(prisma, request, caller, new Date("2026-08-30T10:05:00.000Z"));
    const third = await evaluateScopedKnowledgeReadiness(prisma, request, caller, new Date("2026-08-30T10:20:00.000Z"));
    expect(first.receiptId).toBe(second.receiptId);
    expect(third.receiptId).not.toBe(first.receiptId);
    expect(first.accessDecision).toBe("DENY");
    expect(first.reasonCodes).toContain("KNOWLEDGE_SOURCE_NOT_CONFIGURED");
  });

  it.skipIf(!process.env.SPECFORGE_CONTINUOUS_INTEGRATION)("does not claim runtime self-containment without runtime evidence", async () => {
    const result = await evaluateScopedKnowledgeReadiness(prisma, { ...request, knowledgeProfile: "RUNTIME_DIAGNOSIS" }, caller, new Date("2026-08-30T10:00:00.000Z"));
    expect(result.trustStatus).not.toBe("SELF_CONTAINED");
    expect(result.reasonCodes).toContain("KNOWLEDGE_SOURCE_NOT_CONFIGURED");
  });
});
