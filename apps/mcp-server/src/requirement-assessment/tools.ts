import { createHash, randomUUID } from "node:crypto";
import { prisma, readableScope, resolveWritableScope, upsertAssetLink, upsertContextPack, upsertProposal, writableActor } from "../persistence";
import type { ArchitectureScopeRef, ContextPack, Proposal } from "@specforge/core";

export interface RequirementAssessmentScopeInput {
  architectureScope: ArchitectureScopeRef;
}

export async function createRequirementAssessment(input: {
  architectureScope: ArchitectureScopeRef;
  requirementId: string;
  revision: number;
  intent: { en: string; zh: string };
  acceptanceCriteria?: Array<{ en: string; zh: string }>;
  qualityTargets?: Array<{ en: string; zh: string }>;
  constraints?: Array<{ en: string; zh: string }>;
  exclusions?: Array<{ en: string; zh: string }>;
  idempotencyKey: string;
  authorId?: string;
  enterpriseId?: string;
}) {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  const existing = await prisma.requirementAssessmentRun.findFirst({ where: { ...scope, idempotencyKey: input.idempotencyKey } });
  if (existing) return { runId: existing.id, status: existing.status, idempotentReplay: true, architectureScope: scope };
  const enterpriseId = input.enterpriseId ?? process.env.SPECFORGE_ENTERPRISE_ID ?? "local-development";
  const briefId = `${input.requirementId}:brief:${input.revision}`;
  const runId = `assessment-run-${randomUUID()}`;
  const contentDigest = digest({ scope, requirementId: input.requirementId, revision: input.revision, intent: input.intent, acceptanceCriteria: input.acceptanceCriteria ?? [], qualityTargets: input.qualityTargets ?? [], constraints: input.constraints ?? [], exclusions: input.exclusions ?? [] });
  await prisma.requirementBrief.upsert({
    where: { applicationServiceId_scopePath_id: { ...scope, id: briefId } },
    create: {
      id: briefId,
      enterpriseId,
      requirementId: input.requirementId,
      revision: input.revision,
      canonicalIntent: input.intent.en,
      localizedContent: input.intent,
      confirmedFacts: [],
      assumptions: [],
      acceptanceCriteria: input.acceptanceCriteria ?? [],
      qualityTargets: input.qualityTargets ?? [],
      constraints: input.constraints ?? [],
      exclusions: input.exclusions ?? [],
      sourceReferences: [],
      authorId: input.authorId ?? writableActor().actorId,
      contentDigest,
      ...scope
    },
    update: { canonicalIntent: input.intent.en, localizedContent: input.intent, acceptanceCriteria: input.acceptanceCriteria ?? [], qualityTargets: input.qualityTargets ?? [], constraints: input.constraints ?? [], exclusions: input.exclusions ?? [], contentDigest }
  });
  const run = await prisma.requirementAssessmentRun.create({
    data: { id: runId, enterpriseId, requirementId: input.requirementId, requirementRevision: input.revision, idempotencyKey: input.idempotencyKey, status: "QUEUED", stage: "QUEUED", ...scope }
  });
  return { runId: run.id, requirementId: run.requirementId, status: run.status, stage: run.stage, architectureScope: scope, idempotentReplay: false };
}

export async function getRequirementAssessment(input: RequirementAssessmentScopeInput & { runId: string }) {
  const scope = readableScope(input.architectureScope.applicationServiceId);
  if (scope.scopePath !== input.architectureScope.scopePath) throw new Error("SCOPE_READ_NOT_AUTHORIZED");
  const run = await prisma.requirementAssessmentRun.findFirst({ where: { id: input.runId, ...scope } });
  if (!run) throw new Error("ASSESSMENT_RUN_NOT_FOUND");
  const assessment = run.assessmentId ? await prisma.requirementAssessment.findFirst({ where: { id: run.assessmentId, ...scope } }) : null;
  return { architectureScope: scope, run, assessment };
}

export async function listRequirementAssessments(input: RequirementAssessmentScopeInput) {
  const scope = readableScope(input.architectureScope.applicationServiceId);
  if (scope.scopePath !== input.architectureScope.scopePath) throw new Error("SCOPE_READ_NOT_AUTHORIZED");
  const [runs, assessments] = await Promise.all([
    prisma.requirementAssessmentRun.findMany({ where: scope, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.requirementAssessment.findMany({ where: scope, orderBy: { createdAt: "desc" }, take: 50 })
  ]);
  return { architectureScope: scope, runs, assessments };
}

export async function acceptRequirementAssessment(input: RequirementAssessmentScopeInput & { assessmentId: string; idempotencyKey: string }) {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  const current = await prisma.requirementAssessment.findFirst({ where: { id: input.assessmentId, ...scope } });
  if (!current) throw new Error("ASSESSMENT_NOT_FOUND");
  if (current.lifecycle === "ACCEPTED") return { assessmentId: current.id, lifecycle: current.lifecycle, idempotentReplay: true, architectureScope: scope };
  if (current.lifecycle !== "REVIEWED") throw new Error(`ASSESSMENT_NOT_REVIEWED:${current.lifecycle}`);
  if (["BLOCKED", "INSUFFICIENT_EVIDENCE"].includes(current.verdict)) throw new Error(`ASSESSMENT_ACCEPTANCE_BLOCKED:${current.verdict}`);
  const updated = await prisma.requirementAssessment.update({ where: { applicationServiceId_scopePath_id: { ...scope, id: current.id } }, data: { lifecycle: "ACCEPTED", reviewResult: { ...(asObject(current.reviewResult)), acceptedAt: new Date().toISOString(), acceptanceIdempotencyKey: input.idempotencyKey } } });
  return { assessmentId: updated.id, lifecycle: updated.lifecycle, idempotentReplay: false, architectureScope: scope };
}

export async function recordAssessmentExecutionActual(input: {
  architectureScope: ArchitectureScopeRef;
  id: string;
  requirementId: string;
  assessmentId: string;
  runId?: string;
  executionProfileId: string;
  modelRevisions?: unknown;
  usageDetails?: unknown;
  toolInvocations?: unknown;
  verificationCycles?: number;
  failedAttempts?: number;
  humanIntervention?: unknown;
  elapsedAgentSeconds?: number;
  actualPersonDays?: number;
  changedAssets?: unknown;
  finalStatus: string;
  contentDigest: string;
}) {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  const existing = await prisma.assessmentExecutionActual.findFirst({ where: { id: input.id, ...scope } });
  if (existing) return { id: existing.id, idempotentReplay: true, architectureScope: scope };
  const actual = await prisma.assessmentExecutionActual.create({ data: { id: input.id, enterpriseId: process.env.SPECFORGE_ENTERPRISE_ID ?? "local-development", requirementId: input.requirementId, assessmentId: input.assessmentId, runId: input.runId, executionProfileId: input.executionProfileId, modelRevisions: (input.modelRevisions ?? {}) as never, usageDetails: (input.usageDetails ?? {}) as never, toolInvocations: (input.toolInvocations ?? []) as never, verificationCycles: input.verificationCycles ?? 0, failedAttempts: input.failedAttempts ?? 0, humanIntervention: (input.humanIntervention ?? {}) as never, elapsedAgentSeconds: input.elapsedAgentSeconds, actualPersonDays: input.actualPersonDays, changedAssets: (input.changedAssets ?? []) as never, finalStatus: input.finalStatus, contentDigest: input.contentDigest, ...scope } });
  return { id: actual.id, idempotentReplay: false, architectureScope: scope };
}

export async function createAssessmentProposalDraft(input: RequirementAssessmentScopeInput & { assessmentId: string; proposal: Omit<Proposal, "architectureScope" | "createdAt" | "updatedAt"> & { localizedContent?: Proposal["localizedContent"] }; idempotencyKey: string }) {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  const assessment = await prisma.requirementAssessment.findFirst({ where: { id: input.assessmentId, ...scope } });
  if (!assessment) throw new Error("ASSESSMENT_NOT_FOUND");
  if (assessment.lifecycle !== "ACCEPTED") throw new Error(`ASSESSMENT_NOT_ACCEPTED:${assessment.lifecycle}`);
  const now = new Date().toISOString();
  const proposal: Proposal = { ...input.proposal, architectureScope: scope, createdAt: now, updatedAt: now };
  const result = await upsertProposal({ proposal });
  await upsertAssetLink({ architectureScope: scope, sourceType: "proposal", sourceId: proposal.id, targetType: "evidence", targetId: input.assessmentId, relationType: "IMPACTS", description: `Assessment draft ${input.idempotencyKey}` });
  return { ...result, assessmentId: input.assessmentId, architectureScope: scope };
}

export async function createAssessmentContextPackDraft(input: RequirementAssessmentScopeInput & { assessmentId: string; contextPack: Omit<ContextPack, "architectureScope" | "createdAt"> & { localizedContent?: ContextPack["localizedContent"] }; idempotencyKey: string }) {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  const assessment = await prisma.requirementAssessment.findFirst({ where: { id: input.assessmentId, ...scope } });
  if (!assessment) throw new Error("ASSESSMENT_NOT_FOUND");
  if (assessment.lifecycle !== "ACCEPTED") throw new Error(`ASSESSMENT_NOT_ACCEPTED:${assessment.lifecycle}`);
  const pack: ContextPack = { ...input.contextPack, architectureScope: scope, createdAt: new Date().toISOString() };
  const result = await upsertContextPack({ contextPack: pack });
  await upsertAssetLink({ architectureScope: scope, sourceType: "contextPack", sourceId: pack.id, targetType: "proposal", targetId: pack.proposalId, relationType: "IMPLEMENTS_CONTEXT_FOR", description: `Assessment context draft ${input.idempotencyKey}` });
  return { ...result, assessmentId: input.assessmentId, architectureScope: scope };
}

export async function cancelRequirementAssessment(input: RequirementAssessmentScopeInput & { runId: string }) {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  const updated = await prisma.requirementAssessmentRun.updateMany({ where: { id: input.runId, ...scope }, data: { status: "CANCELLATION_REQUESTED", cancellationRequestedAt: new Date() } });
  if (updated.count !== 1) throw new Error("ASSESSMENT_RUN_NOT_FOUND");
  return { runId: input.runId, status: "CANCELLATION_REQUESTED", architectureScope: scope };
}

function digest(value: unknown): string { return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`; }
function asObject(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
