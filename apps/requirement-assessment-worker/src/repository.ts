import { PrismaClient, type Prisma } from "@prisma/client";
import type {
  AssessmentEvidenceSnapshotRef,
  AssessmentRunRef,
  AssessmentRunStatus,
  AssessmentScopeRef,
  RequirementBrief
} from "@specforge/core";

export interface RequirementAssessmentRunRecord extends AssessmentRunRef {
  requirementId: string;
  requirementRevision: number;
  status: AssessmentRunStatus;
  stage: string;
  evidenceSnapshotId?: string | null;
  assessmentId?: string | null;
  leaseOwner?: string | null;
  leaseExpiresAt?: Date | null;
  heartbeatAt?: Date | null;
  retryCount: number;
  stopReason?: string | null;
}

export type AssessmentRunPatch = Partial<Omit<RequirementAssessmentRunRecord, "id" | "applicationServiceId" | "scopePath" | "enterpriseId">>;

export interface AssessmentEvidenceSnapshot extends AssessmentEvidenceSnapshotRef {
  enterpriseId: string;
  requirementId: string;
  requirementRevision: number;
  authorizationDecisionRef: string;
  orderedAssetManifest: unknown;
  relationshipManifest: unknown;
  promptTemplateDigest: string;
  reviewTemplateDigest: string;
  modelProfileRevision: string;
  executionProfileRevision: string;
  validAtWaterline: string;
}

export interface CreateRequirementBriefInput extends RequirementBrief {
  enterpriseId: string;
  contentDigest: string;
  sourceReferences?: unknown;
}

export interface CreateAssessmentRunInput extends AssessmentRunRef {
  requirementId: string;
  requirementRevision: number;
  idempotencyKey: string;
  status?: AssessmentRunStatus;
  stage?: string;
}

export interface SaveAssessmentRevisionInput extends AssessmentScopeRef {
  enterpriseId: string;
  id: string;
  requirementId: string;
  revision: number;
  lifecycle: string;
  verdict: string;
  confidence: number;
  evidenceCoverage: number;
  evidenceSnapshotId: string;
  designContextDigest: string;
  canonicalSummary: string;
  localizedContent?: unknown;
  impactedFacts?: unknown;
  hardConstraints?: unknown;
  unresolvedDependencies?: unknown;
  solutionOptions?: unknown;
  workBreakdown?: unknown;
  humanEstimate?: unknown;
  aiEstimate?: unknown;
  assumptions?: unknown;
  unknowns?: unknown;
  sensitivityFactors?: unknown;
  reviewResult?: unknown;
  validAtWaterline: string;
  contentDigest: string;
}

export function assertExactScope(scope: AssessmentScopeRef): void {
  if (!scope.applicationServiceId?.trim() || !scope.scopePath?.trim()) {
    throw new Error("ASSESSMENT_SCOPE_REQUIRED");
  }
}

export function scopeWhere(scope: AssessmentScopeRef): { applicationServiceId: string; scopePath: string } {
  assertExactScope(scope);
  return { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath };
}

export class PrismaRequirementAssessmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createBrief(input: CreateRequirementBriefInput) {
    const scope = scopeWhere(input);
    return this.prisma.requirementBrief.create({
      data: {
        id: input.id,
        enterpriseId: input.enterpriseId,
        requirementId: input.id,
        revision: input.revision,
        canonicalIntent: input.intent.en,
        localizedContent: input.intent as unknown as Prisma.InputJsonValue,
        confirmedFacts: input.confirmedFacts as unknown as Prisma.InputJsonValue,
        assumptions: input.assumptions as unknown as Prisma.InputJsonValue,
        acceptanceCriteria: input.acceptanceCriteria as unknown as Prisma.InputJsonValue,
        qualityTargets: input.qualityTargets as unknown as Prisma.InputJsonValue,
        constraints: input.constraints as unknown as Prisma.InputJsonValue,
        exclusions: input.exclusions as unknown as Prisma.InputJsonValue,
        sourceReferences: (input.sourceReferences ?? []) as Prisma.InputJsonValue,
        authorId: input.author,
        contentDigest: input.contentDigest,
        ...scope
      }
    });
  }

  async createRun(input: CreateAssessmentRunInput): Promise<RequirementAssessmentRunRecord> {
    const scope = scopeWhere(input);
    const row = await this.prisma.requirementAssessmentRun.create({
      data: {
        id: input.id,
        enterpriseId: input.enterpriseId,
        requirementId: input.requirementId,
        requirementRevision: input.requirementRevision,
        idempotencyKey: input.idempotencyKey,
        status: input.status ?? "QUEUED",
        stage: input.stage ?? "QUEUED",
        ...scope
      }
    });
    return toRunRecord(row);
  }

  async findRun(ref: AssessmentRunRef): Promise<RequirementAssessmentRunRecord | null> {
    const row = await this.prisma.requirementAssessmentRun.findFirst({ where: { id: ref.id, enterpriseId: ref.enterpriseId, ...scopeWhere(ref) } });
    return row ? toRunRecord(row) : null;
  }

  async claimRun(ref: AssessmentRunRef, leaseOwner: string, leaseExpiresAt: Date): Promise<RequirementAssessmentRunRecord | null> {
    const scope = scopeWhere(ref);
    const current = await this.prisma.requirementAssessmentRun.findFirst({
      where: {
        id: ref.id,
        enterpriseId: ref.enterpriseId,
        ...scope,
        OR: [
          { status: "QUEUED" },
          { status: "RUNNING", OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: new Date() } }] }
        ]
      }
    });
    if (!current) return null;
    const updated = await this.prisma.requirementAssessmentRun.updateMany({
      where: { dbId: current.dbId, id: ref.id, enterpriseId: ref.enterpriseId, ...scope },
      data: { status: "RUNNING", stage: "RESOLVING_EVIDENCE", leaseOwner, leaseExpiresAt, heartbeatAt: new Date(), startedAt: current.startedAt ?? new Date() }
    });
    if (updated.count !== 1) return null;
    return this.findRun(ref);
  }

  async updateRunning(ref: AssessmentRunRef, leaseOwner: string, patch: AssessmentRunPatch): Promise<RequirementAssessmentRunRecord | null> {
    const scope = scopeWhere(ref);
    const updated = await this.prisma.requirementAssessmentRun.updateMany({
      where: { id: ref.id, enterpriseId: ref.enterpriseId, leaseOwner, ...scope },
      data: toRunPatch(patch)
    });
    return updated.count === 1 ? this.findRun(ref) : null;
  }

  async heartbeat(ref: AssessmentRunRef, leaseOwner: string, leaseExpiresAt: Date): Promise<RequirementAssessmentRunRecord | null> {
    const scope = scopeWhere(ref);
    const updated = await this.prisma.requirementAssessmentRun.updateMany({
      where: { id: ref.id, enterpriseId: ref.enterpriseId, leaseOwner, ...scope },
      data: { heartbeatAt: new Date(), leaseExpiresAt }
    });
    return updated.count === 1 ? this.findRun(ref) : null;
  }

  async saveSnapshot(input: AssessmentEvidenceSnapshot): Promise<void> {
    const scope = scopeWhere(input);
    await this.prisma.assessmentEvidenceSnapshot.upsert({
      where: { applicationServiceId_scopePath_id: { ...scope, id: input.id } },
      create: {
        id: input.id,
        enterpriseId: input.enterpriseId,
        requirementId: input.requirementId,
        requirementRevision: input.requirementRevision,
        authorizationDecisionRef: input.authorizationDecisionRef,
        catalogWaterline: input.catalogWaterline,
        relationshipWaterline: input.relationshipWaterline,
        projectionCheckpoint: input.projectionCheckpoint,
        orderedAssetManifest: input.orderedAssetManifest as Prisma.InputJsonValue,
        relationshipManifest: input.relationshipManifest as Prisma.InputJsonValue,
        rulesetRevision: input.rulesetRevision,
        coveragePolicyRevision: input.coveragePolicyRevision,
        promptTemplateDigest: input.promptTemplateDigest,
        reviewTemplateDigest: input.reviewTemplateDigest,
        modelProfileRevision: input.modelProfileRevision,
        executionProfileRevision: input.executionProfileRevision,
        contentDigest: input.contentDigest,
        validAtWaterline: input.validAtWaterline,
        ...scope
      },
      update: {
        orderedAssetManifest: input.orderedAssetManifest as Prisma.InputJsonValue,
        relationshipManifest: input.relationshipManifest as Prisma.InputJsonValue,
        contentDigest: input.contentDigest,
        validAtWaterline: input.validAtWaterline,
        projectionCheckpoint: input.projectionCheckpoint
      }
    });
  }

  async saveAssessmentRevision(input: SaveAssessmentRevisionInput) {
    const scope = scopeWhere(input);
    const data = {
        id: input.id,
        enterpriseId: input.enterpriseId,
        requirementId: input.requirementId,
        revision: input.revision,
        lifecycle: input.lifecycle,
        verdict: input.verdict,
        confidence: input.confidence,
        evidenceCoverage: input.evidenceCoverage,
        evidenceSnapshotId: input.evidenceSnapshotId,
        designContextDigest: input.designContextDigest,
        canonicalSummary: input.canonicalSummary,
        localizedContent: (input.localizedContent ?? {}) as Prisma.InputJsonValue,
        impactedFacts: (input.impactedFacts ?? []) as Prisma.InputJsonValue,
        hardConstraints: (input.hardConstraints ?? []) as Prisma.InputJsonValue,
        unresolvedDependencies: (input.unresolvedDependencies ?? []) as Prisma.InputJsonValue,
        solutionOptions: (input.solutionOptions ?? []) as Prisma.InputJsonValue,
        workBreakdown: (input.workBreakdown ?? []) as Prisma.InputJsonValue,
        humanEstimate: (input.humanEstimate ?? {}) as Prisma.InputJsonValue,
        aiEstimate: (input.aiEstimate ?? {}) as Prisma.InputJsonValue,
        assumptions: (input.assumptions ?? []) as Prisma.InputJsonValue,
        unknowns: (input.unknowns ?? []) as Prisma.InputJsonValue,
        sensitivityFactors: (input.sensitivityFactors ?? []) as Prisma.InputJsonValue,
        reviewResult: (input.reviewResult ?? {}) as Prisma.InputJsonValue,
        validAtWaterline: input.validAtWaterline,
        contentDigest: input.contentDigest,
        ...scope
    };
    return this.prisma.requirementAssessment.upsert({
      where: { applicationServiceId_scopePath_id: { ...scope, id: input.id } },
      create: data,
      update: data
    });
  }

  async markStale(ref: AssessmentRunRef & { assessmentId: string }, reason: string) {
    const scope = scopeWhere(ref);
    const result = await this.prisma.requirementAssessment.updateMany({
      where: { id: ref.assessmentId, enterpriseId: ref.enterpriseId, ...scope },
      data: { lifecycle: "STALE", staleReason: reason, invalidatedBy: "freshness-check", invalidatedAt: new Date() }
    });
    return result.count === 1 ? this.prisma.requirementAssessment.findFirst({ where: { id: ref.assessmentId, enterpriseId: ref.enterpriseId, ...scope } }) : null;
  }

  async requestCancellation(ref: AssessmentRunRef): Promise<void> {
    const scope = scopeWhere(ref);
    await this.prisma.requirementAssessmentRun.updateMany({
      where: { id: ref.id, enterpriseId: ref.enterpriseId, ...scope },
      data: { status: "CANCELLATION_REQUESTED", cancellationRequestedAt: new Date() }
    });
  }

  async listRunnableRuns(scope: AssessmentScopeRef, limit = 10): Promise<RequirementAssessmentRunRecord[]> {
    const rows = await this.prisma.requirementAssessmentRun.findMany({ where: { ...scopeWhere(scope), status: "QUEUED" }, orderBy: [{ createdAt: "asc" }, { dbId: "asc" }], take: limit });
    return rows.map(toRunRecord);
  }

  async findBrief(ref: AssessmentRunRef, requirementId: string, revision: number) {
    return this.prisma.requirementBrief.findFirst({ where: { requirementId, revision, ...scopeWhere(ref) } });
  }

  async findSnapshot(ref: AssessmentRunRef, snapshotId: string) {
    return this.prisma.assessmentEvidenceSnapshot.findFirst({ where: { id: snapshotId, ...scopeWhere(ref) } });
  }

  async markReviewed(ref: AssessmentRunRef, assessmentId: string, reviewResult: unknown) {
    const updated = await this.prisma.requirementAssessment.updateMany({ where: { id: assessmentId, lifecycle: "ASSESSED", ...scopeWhere(ref) }, data: { lifecycle: "REVIEWED", reviewResult: reviewResult as Prisma.InputJsonValue } });
    if (updated.count !== 1) throw new Error("ASSESSMENT_REVIEW_FENCE_LOST");
  }

  async currentWaterline(scope: AssessmentScopeRef): Promise<string> {
    const [cursor, relationship] = await Promise.all([
      this.prisma.authoredCatalogCursor.findUnique({ where: { applicationServiceId_scopePath: scopeWhere(scope) }, select: { nextVersion: true } }),
      this.prisma.relationshipEvent.aggregate({ where: scopeWhere(scope), _max: { graphVersion: true } })
    ]);
    return `${cursor?.nextVersion?.toString() ?? "0"}:${relationship._max.graphVersion?.toString() ?? "0"}`;
  }

  async listAssessmentsForFreshness(scope: AssessmentScopeRef, limit = 100) {
    return this.prisma.requirementAssessment.findMany({ where: { lifecycle: { in: ["ACCEPTED", "REVIEWED", "ASSESSED"] }, ...scopeWhere(scope) }, orderBy: { updatedAt: "asc" }, take: limit });
  }
}

function toRunRecord(row: {
  id: string; enterpriseId: string; requirementId: string; requirementRevision: number; status: string; stage: string;
  applicationServiceId: string; scopePath: string; evidenceSnapshotId: string | null;
  assessmentId: string | null; leaseOwner: string | null; leaseExpiresAt: Date | null;
  heartbeatAt: Date | null; retryCount: number; stopReason: string | null;
}): RequirementAssessmentRunRecord {
  return {
    id: row.id,
    enterpriseId: row.enterpriseId,
    requirementId: row.requirementId,
    requirementRevision: row.requirementRevision,
    status: row.status as AssessmentRunStatus,
    stage: row.stage,
    applicationServiceId: row.applicationServiceId,
    scopePath: row.scopePath,
    evidenceSnapshotId: row.evidenceSnapshotId,
    assessmentId: row.assessmentId,
    leaseOwner: row.leaseOwner,
    leaseExpiresAt: row.leaseExpiresAt,
    heartbeatAt: row.heartbeatAt,
    retryCount: row.retryCount,
    stopReason: row.stopReason
  };
}

function toRunPatch(patch: AssessmentRunPatch): Prisma.RequirementAssessmentRunUpdateManyMutationInput {
  const allowed = ["status", "stage", "evidenceSnapshotId", "assessmentId", "leaseExpiresAt", "heartbeatAt", "retryCount", "stopReason"] as const;
  return Object.fromEntries(allowed.filter((key) => patch[key] !== undefined).map((key) => [key, patch[key]]));
}
