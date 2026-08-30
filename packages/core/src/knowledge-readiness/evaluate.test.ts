import { describe, expect, it } from "vitest";
import {
  composeKnowledgeReadinessPolicy,
  enterpriseMinimumPolicy,
  evaluateKnowledgeReadiness,
  type KnowledgeEvidenceSnapshot
} from "./index";

const now = new Date("2026-08-30T10:00:00.000Z");
const healthy: KnowledgeEvidenceSnapshot = {
  baseline: { id: "baseline-1", digest: "b".repeat(64), publishedAt: now },
  catalogWaterline: "42",
  relationshipWaterline: "17",
  reconciliation: { id: "rec-1", status: "CONVERGED", digest: "r".repeat(64), createdAt: now },
  sources: [
    { role: "DESIGN_CATALOG", authority: "SPECFORGE", fullSnapshotCompleted: true, snapshotId: "design-1", waterline: "42", observedAt: now, receivedAt: now, pendingCount: 0, openTombstoneCount: 0 },
    { role: "SOURCE_CODE", authority: "EXTERNAL", fullSnapshotCompleted: true, snapshotId: "code-1", waterline: "9", observedAt: now, receivedAt: now, pendingCount: 0, openTombstoneCount: 0 }
  ],
  unresolvedConflictCount: 0,
  pendingCandidateCount: 0
};

describe("system knowledge readiness", () => {
  it("rejects a Scope overlay that weakens the enterprise minimum", () => {
    expect(() => composeKnowledgeReadinessPolicy({ id: "scope-policy", version: 1, profileId: "ARCHITECTURE_OVERVIEW", maximumFreshnessSeconds: { SOURCE_CODE: 8 * 24 * 60 * 60 } })).toThrow("KNOWLEDGE_POLICY_VIOLATION");
  });

  it("allows a current complete architecture overview", () => {
    const policy = composeKnowledgeReadinessPolicy();
    expect(evaluateKnowledgeReadiness({ profileId: "ARCHITECTURE_OVERVIEW", policy, snapshot: healthy, now }).trustStatus).toBe("SELF_CONTAINED");
  });

  it.each([
    ["delta only", { ...healthy, sources: healthy.sources.map((source) => source.role === "SOURCE_CODE" ? { ...source, fullSnapshotCompleted: false } : source) }, "KNOWLEDGE_FULL_SNAPSHOT_REQUIRED"],
    ["pending promotion", { ...healthy, pendingCandidateCount: 1 }, "KNOWLEDGE_PENDING_PROMOTION"],
    ["unresolved conflict", { ...healthy, unresolvedConflictCount: 1 }, "KNOWLEDGE_CONFLICT_UNRESOLVED"]
  ])("fails closed for %s", (_label, snapshot, reason) => {
    const decision = evaluateKnowledgeReadiness({ profileId: "ARCHITECTURE_OVERVIEW", policy: enterpriseMinimumPolicy, snapshot, now });
    expect(decision.trustStatus).not.toBe("SELF_CONTAINED");
    expect(decision.reasonCodes).toContain(reason);
  });

  it("does not let future or late timestamps refresh a source", () => {
    const source = healthy.sources[1]!;
    const snapshot = { ...healthy, sources: [healthy.sources[0]!, { ...source, observedAt: new Date("2026-08-30T10:10:00.000Z"), receivedAt: new Date("2026-08-30T08:00:00.000Z") }] };
    expect(evaluateKnowledgeReadiness({ profileId: "ARCHITECTURE_OVERVIEW", policy: enterpriseMinimumPolicy, snapshot, now }).reasonCodes).toContain("KNOWLEDGE_STALE");
  });

  it("requires real runtime evidence", () => {
    const decision = evaluateKnowledgeReadiness({ profileId: "RUNTIME_DIAGNOSIS", policy: enterpriseMinimumPolicy, snapshot: healthy, now });
    expect(decision.trustStatus).toBe("SOURCE_CHECK_REQUIRED");
    expect(decision.reasonCodes).toContain("KNOWLEDGE_SOURCE_NOT_CONFIGURED");
  });
});
