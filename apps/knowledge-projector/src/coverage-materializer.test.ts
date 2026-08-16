import { describe, expect, it } from "vitest";
import type { CoverageBuildJob } from "./coverage-repository.js";
import { materializeCoverageBatch, type CoverageSnapshot } from "./coverage-materializer.js";

const scope = { applicationServiceId: "com.example.orders", scopePath: "org/orders/service" };
const job: CoverageBuildJob = { ...scope, id: "job-1", buildKey: "build", baselineId: "baseline-v6", generationId: "generation-1", profileId: "generic-system", profileVersion: "2", coverageSchemaVersion: "coverage.v1", catalogVersion: "2", catalogDigest: "catalog", relationshipVersion: "4", relationshipDigest: "relationships", query: {}, inputDigest: "input", status: "BUILDING", attempt: 1, checkpoint: {}, rowCount: 0, coveredCount: 0, blockedCount: 0, notEvaluatedCount: 0 };

function snapshot(): CoverageSnapshot {
  return { ...scope, baselineId: job.baselineId, generationId: job.generationId, catalogVersion: "2", relationshipVersion: "4", directMemberIds: ["api-1"], revisions: [
    { ...scope, catalogVersion: "1", assetType: "api", assetId: "api-1", operation: "UPSERT", payload: { id: "api-1", localizedContent: { zh: { name: "创建订单" } } }, contentDigest: "api-digest" },
    { ...scope, catalogVersion: "2", assetType: "evidence", assetId: "evidence-1", operation: "UPSERT", payload: { id: "evidence-1", localizedContent: { zh: { name: "证据" } } }, contentDigest: "evidence-digest" }
  ], relationships: [
    { ...scope, relationshipIdentity: "evidence-adr", relationCode: "VALIDATES", sourceType: "evidence", sourceId: "evidence-1", targetType: "adr", targetId: "adr-1" },
    { ...scope, relationshipIdentity: "adr-api", relationCode: "DECIDES", sourceType: "adr", sourceId: "adr-1", targetType: "api", targetId: "api-1" }
  ] };
}

describe("deterministic coverage materializer", () => {
  it("reconstructs the latest authored state and evaluates a bounded path", () => {
    const result = materializeCoverageBatch(job, snapshot(), undefined, 10);
    expect(result.complete).toBe(true);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.find((row) => row.assetId === "api-1")).toMatchObject({ status: "COVERED", role: "MEMBERSHIP" });
    expect(result.rows.find((row) => row.assetId === "evidence-1")).toMatchObject({ status: "COVERED", role: "TRACEABILITY", terminalMemberId: "api-1" });
  });

  it("is stable when relationship input order changes", () => {
    const first = materializeCoverageBatch(job, snapshot(), undefined, 10).rows;
    const base = snapshot();
    const reversed = { ...base, relationships: [...base.relationships].reverse() };
    const second = materializeCoverageBatch(job, reversed, undefined, 10).rows;
    expect(second).toEqual(first);
  });

  it("rejects a cross-Scope snapshot", () => {
    expect(() => materializeCoverageBatch(job, { ...snapshot(), scopePath: "other/service" })).toThrow("COVERAGE_SNAPSHOT_SCOPE_MISMATCH");
  });

  it("does not treat unrelated direct members as ambiguous", () => {
    const result = materializeCoverageBatch(job, { ...snapshot(), directMemberIds: ["api-1", "api-2"], directMemberships: [{ assetType: "api", assetId: "api-1" }] }, undefined, 10);
    expect(result.rows.find((row) => row.assetId === "api-1")).toMatchObject({ status: "COVERED", role: "MEMBERSHIP" });
  });
});
