import { invalidationReason, type AssessmentScopeRef } from "@specforge/core";
import type { PrismaRequirementAssessmentRepository } from "./repository";

export interface FreshnessScanResult {
  checked: number;
  invalidated: number;
  reasons: Record<string, number>;
}

export class RequirementAssessmentFreshnessScanner {
  constructor(private readonly repository: PrismaRequirementAssessmentRepository) {}

  async scan(scope: AssessmentScopeRef, limit = 100): Promise<FreshnessScanResult> {
    const [assessments, currentWaterline] = await Promise.all([
      this.repository.listAssessmentsForFreshness(scope, limit),
      this.repository.currentWaterline(scope)
    ]);
    const result: FreshnessScanResult = { checked: assessments.length, invalidated: 0, reasons: {} };
    for (const assessment of assessments) {
      const snapshot = await this.repository.findSnapshot({ ...scope, id: `assessment:${assessment.id}`, enterpriseId: assessment.enterpriseId }, assessment.evidenceSnapshotId);
      const reason = invalidationReason({
        snapshotDigest: snapshot?.validAtWaterline ?? "missing",
        currentDigest: currentWaterline,
        reconciliationStatus: process.env.SPECFORGE_ASSESSMENT_RECONCILIATION_STATUS ?? "UNVERIFIED",
        briefSuperseded: false
      });
      if (!reason) continue;
      await this.repository.markStale({ ...scope, id: `assessment:${assessment.id}`, enterpriseId: assessment.enterpriseId, assessmentId: assessment.id }, reason);
      result.invalidated += 1;
      result.reasons[reason] = (result.reasons[reason] ?? 0) + 1;
    }
    return result;
  }
}
