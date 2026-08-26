import { randomUUID } from "node:crypto";
import { assertWritableApplicationService, scopeById, type ScopedPrincipal } from "@specforge/core";
import { prisma } from "./db";
import { requireReadableApplicationService, scopeDatabaseWhere, type ResolvedApplicationServiceScope } from "./scope";

export type RequirementAssessmentScope = ResolvedApplicationServiceScope;

export function resolveAssessmentScope(scopeId: string, principal?: ScopedPrincipal): RequirementAssessmentScope {
  return requireReadableApplicationService(scopeId, principal);
}

function writableScope(scopeId: string, principal: ScopedPrincipal): RequirementAssessmentScope {
  const scope = scopeById(scopeId);
  if (!scope) throw new Error("SCOPE_NOT_FOUND");
  assertWritableApplicationService(principal, scope);
  return scope as RequirementAssessmentScope;
}

export async function listRequirementAssessments(scopeId: string, principal?: ScopedPrincipal) {
  const scope = resolveAssessmentScope(scopeId, principal);
  const [runs, assessments] = await Promise.all([
    prisma.requirementAssessmentRun.findMany({ where: scopeDatabaseWhere(scope), orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.requirementAssessment.findMany({ where: scopeDatabaseWhere(scope), orderBy: { createdAt: "desc" }, take: 50 })
  ]);
  return { architectureScope: scope, runs: runs.map(serialize), assessments: assessments.map(serialize) };
}

export async function getRequirementAssessment(id: string, scopeId: string, principal?: ScopedPrincipal) {
  const scope = resolveAssessmentScope(scopeId, principal);
  const run = await prisma.requirementAssessmentRun.findFirst({ where: { id, ...scopeDatabaseWhere(scope) } });
  const assessment = run?.assessmentId
    ? await prisma.requirementAssessment.findFirst({ where: { id: run.assessmentId, ...scopeDatabaseWhere(scope) } })
    : await prisma.requirementAssessment.findFirst({ where: { id, ...scopeDatabaseWhere(scope) } });
  if (!run && !assessment) throw new Error("ASSESSMENT_NOT_FOUND");
  const brief = await prisma.requirementBrief.findFirst({ where: { requirementId: run?.requirementId ?? assessment?.requirementId, ...scopeDatabaseWhere(scope) }, orderBy: { revision: "desc" } });
  const snapshot = run?.evidenceSnapshotId ? await prisma.assessmentEvidenceSnapshot.findFirst({ where: { id: run.evidenceSnapshotId, ...scopeDatabaseWhere(scope) } }) : null;
  return { architectureScope: scope, run: run ? serialize(run) : null, assessment: assessment ? serialize(assessment) : null, brief: brief ? serialize(brief) : null, snapshot: snapshot ? serialize(snapshot) : null };
}

export async function createRequirementAssessment(input: {
  scopeId: string;
  principal: ScopedPrincipal;
  requirementId: string;
  revision: number;
  intent: { en: string; zh: string };
  acceptanceCriteria?: Array<{ en: string; zh: string }>;
  qualityTargets?: Array<{ en: string; zh: string }>;
  constraints?: Array<{ en: string; zh: string }>;
  exclusions?: Array<{ en: string; zh: string }>;
  idempotencyKey: string;
}) {
  const scope = writableScope(input.scopeId, input.principal);
  const dbScope = scopeDatabaseWhere(scope);
  const existing = await prisma.requirementAssessmentRun.findFirst({ where: { idempotencyKey: input.idempotencyKey, ...scopeDatabaseWhere(scope) } });
  if (existing) return { runId: existing.id, status: existing.status, stage: existing.stage, idempotentReplay: true, architectureScope: scope };
  const briefId = `${input.requirementId}:brief:${input.revision}`;
  const enterpriseId = process.env.SPECFORGE_ENTERPRISE_ID ?? "local-development";
  const contentDigest = `web-intake:${input.requirementId}:${input.revision}:${input.intent.en}`;
  await prisma.requirementBrief.upsert({
    where: { applicationServiceId_scopePath_id: { ...dbScope, id: briefId } },
    create: { id: briefId, enterpriseId, requirementId: input.requirementId, revision: input.revision, canonicalIntent: input.intent.en, localizedContent: input.intent, confirmedFacts: [], assumptions: [], acceptanceCriteria: input.acceptanceCriteria ?? [], qualityTargets: input.qualityTargets ?? [], constraints: input.constraints ?? [], exclusions: input.exclusions ?? [], sourceReferences: [], authorId: input.principal.actorId, contentDigest, ...dbScope },
    update: { canonicalIntent: input.intent.en, localizedContent: input.intent, acceptanceCriteria: input.acceptanceCriteria ?? [], qualityTargets: input.qualityTargets ?? [], constraints: input.constraints ?? [], exclusions: input.exclusions ?? [], contentDigest }
  });
  const run = await prisma.requirementAssessmentRun.create({ data: { id: `assessment-run-${randomUUID()}`, enterpriseId, requirementId: input.requirementId, requirementRevision: input.revision, idempotencyKey: input.idempotencyKey, status: "QUEUED", stage: "QUEUED", ...dbScope } });
  return { runId: run.id, requirementId: run.requirementId, status: run.status, stage: run.stage, idempotentReplay: false, architectureScope: scope };
}

export async function cancelRequirementAssessment(id: string, scopeId: string, principal: ScopedPrincipal) {
  const scope = writableScope(scopeId, principal);
  const result = await prisma.requirementAssessmentRun.updateMany({ where: { id, ...scopeDatabaseWhere(scope) }, data: { status: "CANCELLATION_REQUESTED", cancellationRequestedAt: new Date() } });
  if (result.count !== 1) throw new Error("ASSESSMENT_NOT_FOUND");
  return { runId: id, status: "CANCELLATION_REQUESTED", architectureScope: scope };
}

function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item)) as T;
}
