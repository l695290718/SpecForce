import { createHash, randomUUID } from "node:crypto";
import { prisma, readableScope, resolveWritableScope, writableActor } from "../persistence";
import type { ArchitectureScopeRef } from "@specforge/core";

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

export async function cancelRequirementAssessment(input: RequirementAssessmentScopeInput & { runId: string }) {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  const updated = await prisma.requirementAssessmentRun.updateMany({ where: { id: input.runId, ...scope }, data: { status: "CANCELLATION_REQUESTED", cancellationRequestedAt: new Date() } });
  if (updated.count !== 1) throw new Error("ASSESSMENT_RUN_NOT_FOUND");
  return { runId: input.runId, status: "CANCELLATION_REQUESTED", architectureScope: scope };
}

function digest(value: unknown): string { return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`; }
