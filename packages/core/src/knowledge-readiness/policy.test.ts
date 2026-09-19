import { describe, expect, it } from "vitest";
import { classifyKnowledgeScanReadiness } from "./policy";
import type { KnowledgeReadinessDecision } from "./types";

const decision = (overrides: Partial<KnowledgeReadinessDecision>): KnowledgeReadinessDecision => ({
  trustStatus: "SOURCE_CHECK_REQUIRED",
  dimensionStatuses: [],
  reasonCodes: ["KNOWLEDGE_SOURCE_NOT_CONFIGURED"],
  remediationActions: ["START_FULL_SCAN"],
  validUntil: new Date("2026-09-20T00:00:00.000Z"),
  ...overrides
});

describe("knowledge scan readiness gate", () => {
  it("allows an authorized bootstrap scan for source coverage reasons", () => {
    expect(classifyKnowledgeScanReadiness(decision({ reasonCodes: ["KNOWLEDGE_SOURCE_NOT_CONFIGURED", "KNOWLEDGE_PENDING_PROMOTION"] }), true)).toBe("BOOTSTRAP_SCAN");
  });

  it("allows bounded reads only for self-contained authorized knowledge", () => {
    expect(classifyKnowledgeScanReadiness(decision({ trustStatus: "SELF_CONTAINED", reasonCodes: [], remediationActions: [] }), true)).toBe("READ");
  });

  it("blocks missing authorization, conflicts and incomplete remediation", () => {
    expect(classifyKnowledgeScanReadiness(decision({}), false)).toBe("BLOCKED");
    expect(classifyKnowledgeScanReadiness(decision({ reasonCodes: ["KNOWLEDGE_CONFLICT_UNRESOLVED"] }), true)).toBe("BLOCKED");
    expect(classifyKnowledgeScanReadiness(decision({ remediationActions: [] }), true)).toBe("BLOCKED");
  });
});
