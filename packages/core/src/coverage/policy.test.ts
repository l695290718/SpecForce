import { describe, expect, it } from "vitest";
import { evaluateCoverageCandidate, genericSystemCoverageProfile, selectCoveragePath } from "./policy";
import type { CoverageCandidate, CoveragePathEvidence } from "./types";

const scope = { applicationServiceId: "com.example.orders", scopePath: "org/product/orders/service" };

function candidate(sourceType: string, sourceId: string, overrides: Partial<CoverageCandidate> = {}): CoverageCandidate {
  return { exactScope: scope, source: { assetType: sourceType, assetId: sourceId }, directMemberIds: [], ...overrides };
}

function edge(overrides: Partial<CoveragePathEvidence[number]> = {}): CoveragePathEvidence[number] {
  return { relationshipIdentity: "link-1", relationCode: "VERIFIES", sourceType: "quality", sourceId: "quality-1", targetType: "api", targetId: "api-1", ...overrides };
}

describe("generic-system@2 coverage policy", () => {
  it("covers direct membership before traceability", () => {
    const result = evaluateCoverageCandidate(candidate("api", "api-1", { directMemberIds: ["api-1"] }), genericSystemCoverageProfile);
    expect(result).toMatchObject({ role: "MEMBERSHIP", status: "COVERED", terminalMemberId: "api-1" });
    expect(result.path).toBeUndefined();
  });

  it("covers every supported governance path grammar", () => {
    const cases: Array<[string, CoveragePathEvidence]> = [
      ["quality", [edge()]],
      ["adr", [edge({ relationCode: "DECIDES", sourceType: "adr", sourceId: "adr-1", targetType: "api" })]],
      ["evidence", [edge({ relationCode: "VALIDATES", sourceType: "evidence", sourceId: "evidence-1", targetType: "adr", targetId: "adr-1" }), edge({ relationshipIdentity: "link-2", relationCode: "DECIDES", sourceType: "adr", sourceId: "adr-1", targetType: "api" })]],
      ["proposal", [edge({ relationCode: "IMPACTS", sourceType: "proposal", sourceId: "proposal-1", targetType: "api" })]],
      ["proposal", [edge({ relationCode: "IMPLEMENTS_DECISION", sourceType: "proposal", sourceId: "proposal-1", targetType: "adr", targetId: "adr-1" }), edge({ relationshipIdentity: "link-2", relationCode: "DECIDES", sourceType: "adr", sourceId: "adr-1", targetType: "api" })]],
      ["contextPack", [edge({ relationCode: "IMPLEMENTS_CONTEXT_FOR", sourceType: "contextPack", sourceId: "context-1", targetType: "proposal", targetId: "proposal-1" }), edge({ relationshipIdentity: "link-2", relationCode: "IMPACTS", sourceType: "proposal", sourceId: "proposal-1", targetType: "api" })]],
      ["contextPack", [edge({ relationCode: "IMPLEMENTS_CONTEXT_FOR", sourceType: "contextPack", sourceId: "context-1", targetType: "proposal", targetId: "proposal-1" }), edge({ relationshipIdentity: "link-2", relationCode: "IMPLEMENTS_DECISION", sourceType: "proposal", sourceId: "proposal-1", targetType: "adr", targetId: "adr-1" }), edge({ relationshipIdentity: "link-3", relationCode: "DECIDES", sourceType: "adr", sourceId: "adr-1", targetType: "api" })]]
    ];
    for (const [sourceType, path] of cases) {
      expect(evaluateCoverageCandidate(candidate(sourceType, path[0]!.sourceId, { path, directMemberIds: ["api-1"] }), genericSystemCoverageProfile)).toMatchObject({ role: "TRACEABILITY", status: "COVERED", terminalMemberId: "api-1" });
    }
  });

  it("rejects wrong direction, invalid type, cross-Scope, and dangling endpoints", () => {
    const evidencePath: CoveragePathEvidence = [
      edge({ relationCode: "VALIDATES", sourceType: "evidence", sourceId: "evidence-1", targetType: "adr", targetId: "adr-1" }),
      edge({ relationshipIdentity: "link-2", relationCode: "DECIDES", sourceType: "adr", sourceId: "adr-1", targetType: "api" })
    ];
    expect(evaluateCoverageCandidate(candidate("evidence", "evidence-1", { path: [...evidencePath].reverse(), directMemberIds: ["api-1"] }), genericSystemCoverageProfile).reasonCode).toBe("RELATION_DIRECTION_INVALID");
    expect(evaluateCoverageCandidate(candidate("evidence", "evidence-1", { path: [evidencePath[0]!, edge({ relationshipIdentity: "link-2", relationCode: "DECIDES", sourceType: "adr", sourceId: "adr-1", targetType: "quality" })], directMemberIds: ["api-1"] }), genericSystemCoverageProfile).reasonCode).toBe("UNSUPPORTED_PATH");
    expect(evaluateCoverageCandidate(candidate("evidence", "evidence-1", { path: evidencePath.map((item) => ({ ...item, architectureScope: { applicationServiceId: "com.example.other", scopePath: "other" } })), directMemberIds: ["api-1"] }), genericSystemCoverageProfile).reasonCode).toBe("ENDPOINT_SCOPE_MISMATCH");
    expect(evaluateCoverageCandidate(candidate("evidence", "evidence-1", { path: evidencePath.map((item, index) => index === 1 ? { ...item, targetExists: false } : item), directMemberIds: ["api-1"] }), genericSystemCoverageProfile).reasonCode).toBe("ENDPOINT_NOT_FOUND");
  });

  it("blocks missing and ambiguous membership and supports governed exemption", () => {
    expect(evaluateCoverageCandidate(candidate("quality", "quality-1"), genericSystemCoverageProfile).reasonCode).toBe("MISSING_TYPED_PATH");
    expect(evaluateCoverageCandidate(candidate("api", "api-1", { directMemberIds: ["api-1", "api-2"] }), genericSystemCoverageProfile).reasonCode).toBe("AMBIGUOUS_MEMBERSHIP");
    expect(evaluateCoverageCandidate(candidate("proposal", "proposal-1", { exemption: { reason: "Owned by an approved external system", owner: "architecture-team", evidenceRefs: ["evidence-1"], policyVersion: "2" } }), genericSystemCoverageProfile)).toMatchObject({ role: "EXEMPTION", status: "COVERED" });
  });

  it("selects the same path regardless of input order", () => {
    const short = [edge({ relationCode: "IMPACTS", sourceType: "proposal", sourceId: "proposal-1", targetType: "api", targetId: "api-z", relationshipIdentity: "z" })];
    const longer = [edge({ relationCode: "IMPLEMENTS_DECISION", sourceType: "proposal", sourceId: "proposal-1", targetType: "adr", targetId: "adr-1", relationshipIdentity: "a" }), edge({ relationCode: "DECIDES", sourceType: "adr", sourceId: "adr-1", targetType: "api", targetId: "api-a", relationshipIdentity: "b" })];
    const context = { exactScope: scope, source: { assetType: "proposal", assetId: "proposal-1" }, directMemberIds: ["api-a", "api-z"] };
    expect(selectCoveragePath([longer, short], genericSystemCoverageProfile, context)).toEqual(short);
    expect(selectCoveragePath([short, longer], genericSystemCoverageProfile, context)).toEqual(short);
  });

  it("returns NOT_EVALUATED when the pinned snapshot is unavailable", () => {
    expect(evaluateCoverageCandidate(candidate("quality", "quality-1", { snapshotAvailable: false }), genericSystemCoverageProfile)).toMatchObject({ status: "NOT_EVALUATED", reasonCode: "SNAPSHOT_UNAVAILABLE" });
  });
});
