import { describe, expect, it } from "vitest";
import type { ScopedPrincipal } from "@specforge/core";
import { prisma } from "../persistence";
import { readSystemKnowledge } from "./read";

const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

const caller: ScopedPrincipal = {
  actorType: "agent",
  actorId: "knowledge-read-test",
  subject: "knowledge-read-test",
  tenantId: "local-development",
  authSource: "seed",
  permissions: ["knowledge:consume"],
  grants: [{ scopeId: scope.applicationServiceId, action: "read" }],
  decisionRef: "knowledge-read-test"
};

const request = {
  architectureScope: scope,
  knowledgeProfile: "ARCHITECTURE_OVERVIEW" as const,
  selectors: [],
  purpose: "knowledge-read-test",
  locale: "en" as const
};

describe("gated system knowledge read", () => {
  it.skipIf(!process.env.SPECFORGE_CONTINUOUS_INTEGRATION)("does not expose assets when readiness is incomplete", async () => {
    const result = await readSystemKnowledge(prisma, request, caller, new Date("2026-08-30T10:00:00.000Z"));

    expect(result.accessDecision).toBe("DENY");
    expect(result.assets).toEqual([]);
    expect(result.relationships).toEqual([]);
    expect(result.nextCursor).toBeUndefined();
    expect(result.reasonCodes.length).toBeGreaterThan(0);
  });
});
