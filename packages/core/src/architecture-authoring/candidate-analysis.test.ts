import { describe, expect, it } from "vitest";
import {
  candidateCounts,
  candidateSetDigest,
  candidateSetIsStale,
  validateCandidateAnalysisRequest,
  validateCandidateSetTransition
} from "./candidate-analysis";

const scope = { applicationServiceId: "com.example.orders", scopePath: "pf-orders/product-orders/service-orders" };
const snapshot = {
  sourceBaselineId: "knowledge-baseline:orders:3a:v1",
  catalogDigest: "catalog-1",
  relationshipVersion: "7",
  designContextDigest: "context-1",
  capturedAt: "2026-08-30T00:00:00.000Z"
};

describe("3A candidate analysis contract", () => {
  it("allows only governed state transitions", () => {
    expect(validateCandidateSetTransition("READY", "STALE")).toBe(true);
    expect(() => validateCandidateSetTransition("READY", "PROMOTED")).toThrow("CANDIDATE_SET_TRANSITION_INVALID");
  });

  it("detects a changed source waterline", () => {
    const candidate = { snapshot };
    expect(candidateSetIsStale(candidate, { ...snapshot, relationshipVersion: "8" })).toBe(true);
    expect(candidateSetIsStale(candidate, snapshot)).toBe(false);
  });

  it("validates an explicit exact-Scope request", () => {
    const candidateBatch = {
      id: "batch-1",
      provenance: { actor: "agent" },
      evidenceRefs: ["evidence:request-1"],
      units: [{ unitIdentity: "unit:biz:orders", layer: "BIZ" }],
      memberships: [],
      mappings: []
    } as any;
    expect(() =>
      validateCandidateAnalysisRequest({
        architectureScope: scope,
        sourceBaselineId: "baseline",
        designChangeSessionId: "session-1",
        intent: "Assess architecture",
        idempotencyKey: "request-1",
        evidenceRefs: ["evidence:request-1"],
        candidateBatch
      })
    ).not.toThrow();
    expect(() =>
      validateCandidateAnalysisRequest({
        architectureScope: scope,
        sourceBaselineId: "baseline",
        designChangeSessionId: "session-1",
        intent: "",
        idempotencyKey: "request-1",
        evidenceRefs: ["evidence:request-1"],
        candidateBatch
      })
    ).toThrow("THREE_A_CANDIDATE_INTENT_REQUIRED");
  });

  it("counts candidates by layer and creates a stable digest", () => {
    const submission = { units: [{ layer: "BIZ" }, { layer: "SYS" }, { layer: "TECH" }, { layer: "SYS" }] } as any;
    expect(candidateCounts(submission)).toEqual({ BIZ: 1, SYS: 2, TECH: 1 });
    const input = {
      architectureScope: scope,
      sourceBaselineId: "baseline",
      batchId: "batch-1",
      architectureFactRevisionIds: {
        unitRevisionIds: ["u1"],
        membershipRevisionIds: ["m1"],
        mappingRevisionIds: ["x1"]
      },
      snapshot,
      candidateCounts: { BIZ: 1, SYS: 2, TECH: 1 },
      excludedCandidates: [],
      blockingIssues: [],
      evidenceRefs: ["evidence:1"]
    } as const;
    expect(candidateSetDigest(input)).toBe(candidateSetDigest({ ...input, evidenceRefs: ["evidence:1"] }));
  });

  it("requires every system and technology unit to be connected across layers", () => {
    const candidateBatch = {
      id: "batch-1",
      provenance: { actor: "agent" },
      evidenceRefs: ["evidence:request-1"],
      units: [
        { unitIdentity: "unit:biz:orders", layer: "BIZ" },
        { unitIdentity: "unit:sys:orders", layer: "SYS" }
      ],
      memberships: [],
      mappings: []
    } as any;
    expect(() =>
      validateCandidateAnalysisRequest({
        architectureScope: scope,
        sourceBaselineId: "baseline",
        designChangeSessionId: "session-1",
        intent: "Assess architecture",
        idempotencyKey: "request-1",
        evidenceRefs: ["evidence:request-1"],
        candidateBatch
      })
    ).toThrow("THREE_A_CANDIDATE_SYS_NOT_CLOSED");
  });
});
