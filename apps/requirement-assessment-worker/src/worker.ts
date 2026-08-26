import { randomUUID } from "node:crypto";
import type { AssessmentRunRef, AssessmentRunStatus } from "@specforge/core";
import type { PrismaRequirementAssessmentRepository, RequirementAssessmentRunRecord } from "./repository";

export interface RequirementAssessmentWorkerRepository {
  findRun(ref: AssessmentRunRef): Promise<RequirementAssessmentRunRecord | null>;
  claimRun(ref: AssessmentRunRef, leaseOwner: string, leaseExpiresAt: Date): Promise<RequirementAssessmentRunRecord | null>;
  updateRunning(ref: AssessmentRunRef, leaseOwner: string, patch: Partial<RequirementAssessmentRunRecord>): Promise<RequirementAssessmentRunRecord | null>;
  heartbeat(ref: AssessmentRunRef, leaseOwner: string, leaseExpiresAt: Date): Promise<RequirementAssessmentRunRecord | null>;
  requestCancellation(ref: AssessmentRunRef): Promise<void>;
}

export interface AssessmentWorkerHandlers {
  resolveEvidence(run: RequirementAssessmentRunRecord): Promise<{ evidenceSnapshotId: string }>;
  evaluate(run: RequirementAssessmentRunRecord): Promise<{ assessmentId: string }>;
  review(run: RequirementAssessmentRunRecord): Promise<void>;
}

export interface AssessmentWorkerOptions {
  workerId?: string;
  leaseDurationMs?: number;
  heartbeatIntervalMs?: number;
  now?: () => Date;
}

export interface AssessmentWorkerRunResult {
  id: string;
  status: AssessmentRunStatus;
  stopReason?: string | null;
}

export class RequirementAssessmentWorker {
  private readonly workerId: string;
  private readonly leaseDurationMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly repository: RequirementAssessmentWorkerRepository,
    private readonly handlers: AssessmentWorkerHandlers,
    options: AssessmentWorkerOptions = {}
  ) {
    this.workerId = options.workerId ?? `requirement-assessment-worker:${randomUUID()}`;
    this.leaseDurationMs = options.leaseDurationMs ?? 30_000;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10_000;
    this.now = options.now ?? (() => new Date());
  }

  async run(ref: AssessmentRunRef): Promise<AssessmentWorkerRunResult> {
    const existing = await this.requireRun(ref);
    if (existing.status === "CANCELLATION_REQUESTED" || existing.status === "CANCELLED") return this.toResult(existing);
    const claimed = await this.repository.claimRun(ref, this.workerId, this.nextLeaseExpiry());
    if (!claimed) return this.toResult(await this.requireRun(ref));
    return this.execute(ref, claimed);
  }

  async retry(ref: AssessmentRunRef): Promise<AssessmentWorkerRunResult> {
    const current = await this.requireRun(ref);
    if (current.status !== "FAILED") throw new Error("ASSESSMENT_RUN_NOT_FAILED");
    const reset = await this.repository.updateRunning(ref, this.workerId, { status: "QUEUED", stage: "QUEUED", stopReason: null });
    if (!reset) throw new Error("ASSESSMENT_RUN_FENCE_LOST");
    return this.run(ref);
  }

  async cancel(ref: AssessmentRunRef): Promise<void> {
    await this.repository.requestCancellation(ref);
  }

  private async execute(ref: AssessmentRunRef, claimed: RequirementAssessmentRunRecord): Promise<AssessmentWorkerRunResult> {
    const heartbeat = setInterval(() => {
      void this.repository.heartbeat(ref, this.workerId, this.nextLeaseExpiry()).catch(() => undefined);
    }, this.heartbeatIntervalMs);
    try {
      const resolving = await this.fencedUpdate(ref, { status: "RESOLVING_EVIDENCE", stage: "RESOLVING_EVIDENCE" });
      if (!resolving) return this.fencedResult(ref);
      const evidence = await this.handlers.resolveEvidence(resolving);
      const waiting = await this.fencedUpdate(ref, { status: "ANALYZING", stage: "ANALYZING", evidenceSnapshotId: evidence.evidenceSnapshotId });
      if (!waiting) return this.fencedResult(ref);
      const assessed = await this.handlers.evaluate(waiting);
      const reviewing = await this.fencedUpdate(ref, { status: "REVIEWING", stage: "REVIEWING", assessmentId: assessed.assessmentId });
      if (!reviewing) return this.fencedResult(ref);
      await this.handlers.review(reviewing);
      const completed = await this.fencedUpdate(ref, { status: "COMPLETE", stage: "COMPLETE", stopReason: null });
      return completed ? this.toResult(completed) : this.fencedResult(ref);
    } catch (error) {
      const failed = await this.repository.updateRunning(ref, this.workerId, { status: "FAILED", stage: "FAILED", stopReason: errorCode(error) });
      return failed ? this.toResult(failed) : this.fencedResult(ref);
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async fencedUpdate(ref: AssessmentRunRef, patch: Partial<RequirementAssessmentRunRecord>): Promise<RequirementAssessmentRunRecord | null> {
    const current = await this.repository.findRun(ref);
    if (!current || current.status === "CANCELLATION_REQUESTED" || current.status === "CANCELLED") {
      if (current?.status === "CANCELLATION_REQUESTED") {
        return this.repository.updateRunning(ref, this.workerId, { status: "CANCELLED", stage: "CANCELLED", stopReason: "CANCELLED_BY_REQUEST" });
      }
      return null;
    }
    return this.repository.updateRunning(ref, this.workerId, patch);
  }

  private async fencedResult(ref: AssessmentRunRef): Promise<AssessmentWorkerRunResult> {
    const current = await this.requireRun(ref);
    return this.toResult(current);
  }

  private async requireRun(ref: AssessmentRunRef): Promise<RequirementAssessmentRunRecord> {
    const run = await this.repository.findRun(ref);
    if (!run) throw new Error("ASSESSMENT_RUN_NOT_FOUND");
    return run;
  }

  private nextLeaseExpiry(): Date { return new Date(this.now().getTime() + this.leaseDurationMs); }
  private toResult(run: RequirementAssessmentRunRecord): AssessmentWorkerRunResult { return { id: run.id, status: run.status, stopReason: run.stopReason }; }
}

export type PrismaRequirementAssessmentWorkerRepository = PrismaRequirementAssessmentRepository;

function errorCode(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 240) : "ASSESSMENT_WORKER_FAILED";
}
