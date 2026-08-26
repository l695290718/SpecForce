import { describe, expect, it } from "vitest";
import { RequirementAssessmentWorker, type AssessmentWorkerHandlers, type RequirementAssessmentWorkerRepository } from "./worker";
import type { AssessmentRunRef } from "@specforge/core";
import type { RequirementAssessmentRunRecord } from "./repository";

const ref: AssessmentRunRef = { id: "run-1", enterpriseId: "enterprise-1", applicationServiceId: "service-1", scopePath: "scope/service-1" };

function fakeRepository(initial: RequirementAssessmentRunRecord): RequirementAssessmentWorkerRepository {
  let current = initial;
  return {
    async findRun(input) { return input.id === current.id && input.applicationServiceId === current.applicationServiceId && input.scopePath === current.scopePath ? current : null; },
    async claimRun(_input, leaseOwner, leaseExpiresAt) { current = { ...current, status: "RESOLVING_EVIDENCE", stage: "RESOLVING_EVIDENCE", leaseOwner, leaseExpiresAt }; return current; },
    async updateRunning(_input, leaseOwner, patch) { if (current.leaseOwner !== leaseOwner) return null; current = { ...current, ...patch }; return current; },
    async heartbeat(_input, leaseOwner, leaseExpiresAt) { if (current.leaseOwner !== leaseOwner) return null; current = { ...current, leaseExpiresAt, heartbeatAt: new Date() }; return current; },
    async requestCancellation() { current = { ...current, status: "CANCELLATION_REQUESTED" }; }
  };
}

const handlers: AssessmentWorkerHandlers = {
  async resolveEvidence() { return { evidenceSnapshotId: "snapshot-1" }; },
  async evaluate() { return { assessmentId: "assessment-1" }; },
  async review() { return undefined; }
};

function runRecord(): RequirementAssessmentRunRecord {
  return { ...ref, requirementId: "brief-1", requirementRevision: 1, status: "QUEUED", stage: "QUEUED", retryCount: 0 };
}

describe("durable requirement assessment worker", () => {
  it("claims, runs checkpoints, and completes through review", async () => {
    const result = await new RequirementAssessmentWorker(fakeRepository(runRecord()), handlers, { workerId: "worker-1" }).run(ref);
    expect(result.status).toBe("COMPLETE");
  });

  it("records provider or handler failure as FAILED and supports cancellation requests", async () => {
    const failureHandlers = { ...handlers, evaluate: async () => { throw new Error("ASSESSMENT_ENGINE_FAILED"); } };
    const result = await new RequirementAssessmentWorker(fakeRepository(runRecord()), failureHandlers, { workerId: "worker-1" }).run(ref);
    expect(result.status).toBe("FAILED");
    const repo = fakeRepository(runRecord());
    await repo.requestCancellation(ref);
    expect((await new RequirementAssessmentWorker(repo, handlers, { workerId: "worker-1" }).run(ref)).status).toBe("CANCELLATION_REQUESTED");
  });
});
