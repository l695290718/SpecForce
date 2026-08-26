import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { PrismaClient } from "@prisma/client";
import { buildEvidenceSnapshot, evaluateRequirement, MockAIProvider, type AssessmentEvidenceReader, type AssessmentScopeRef, type RequirementBrief } from "@specforge/core";
import { RequirementAssessmentFreshnessScanner } from "./freshness";
import { PrismaRequirementAssessmentRepository, type RequirementAssessmentRunRecord } from "./repository";
import { RequirementAssessmentWorker } from "./worker";

const applicationServiceId = process.env.SPECFORGE_ASSESSMENT_WORKER_APPLICATION_SERVICE_ID ?? "com.huawei.celon.desiner";
const scopePath = process.env.SPECFORGE_ASSESSMENT_WORKER_SCOPE_PATH ?? "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner";
const intervalMs = number(process.env.SPECFORGE_ASSESSMENT_WORKER_INTERVAL_MS, 5000);
const batchLimit = number(process.env.SPECFORGE_ASSESSMENT_WORKER_BATCH_LIMIT, 5);
const enterpriseId = process.env.SPECFORGE_ENTERPRISE_ID ?? "local-development";
const scope: AssessmentScopeRef = { applicationServiceId, scopePath };

async function main() {
  if (intervalMs < 100 || intervalMs > 60_000) throw new Error("ASSESSMENT_WORKER_INTERVAL_INVALID");
  const prisma = new PrismaClient();
  const repository = new PrismaRequirementAssessmentRepository(prisma);
  const freshness = new RequirementAssessmentFreshnessScanner(repository);
  const worker = new RequirementAssessmentWorker(repository, {
    resolveEvidence: (run) => resolveEvidence(prisma, repository, run),
    evaluate: (run) => evaluateRun(prisma, repository, run),
    review: (run) => reviewRun(repository, run)
  }, { leaseDurationMs: number(process.env.SPECFORGE_ASSESSMENT_WORKER_LEASE_MS, 30_000) });
  await prisma.$connect();
  let lastTick: Record<string, unknown> | null = null;
  let active: Promise<void> | undefined;
  const tick = () => {
    if (active) return active;
    active = (async () => {
      const stale = await freshness.scan(scope);
      const runs = await repository.listRunnableRuns(scope, batchLimit);
      const results = [];
      for (const run of runs) results.push(await worker.run({ id: run.id, enterpriseId: run.enterpriseId, ...scope }));
      lastTick = { at: new Date().toISOString(), stale, runs: results };
    })().catch((error) => { lastTick = { at: new Date().toISOString(), failed: true, code: errorCode(error) }; }).finally(() => { active = undefined; });
    return active;
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
  const port = number(process.env.SPECFORGE_ASSESSMENT_WORKER_PORT, 8093);
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (request.method !== "GET" || path !== "/healthz") { response.writeHead(404).end(); return; }
    const failed = Boolean(lastTick?.failed);
    response.writeHead(failed ? 503 : 200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: failed ? "degraded" : lastTick ? "ok" : "starting", scope, lastTick }));
  });
  server.listen(port, process.env.SPECFORGE_ASSESSMENT_WORKER_HOST ?? "0.0.0.0");
  const shutdown = async () => { clearInterval(timer); await active; await new Promise<void>((resolve) => server.close(() => resolve())); await prisma.$disconnect(); };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

async function resolveEvidence(prisma: PrismaClient, repository: PrismaRequirementAssessmentRepository, run: RequirementAssessmentRunRecord) {
  const briefRow = await repository.findBrief(run, run.requirementId, run.requirementRevision);
  if (!briefRow) throw new Error("ASSESSMENT_BRIEF_NOT_FOUND");
  const brief = briefFromRow(briefRow);
  const snapshot = await buildEvidenceSnapshot({ scope, brief, reader: createEvidenceReader(prisma), promptTemplateDigest: "sha256:mock-assessment-prompt-v1", reviewTemplateDigest: "sha256:mock-assessment-review-v1", modelProfileRevision: "mock-model-profile:v1", executionProfileRevision: "reference-agent-profile:v1", policyRevision: "requirement-assessment-coverage-v1" });
  await repository.saveSnapshot({ ...snapshot, enterpriseId: run.enterpriseId });
  return { evidenceSnapshotId: snapshot.id };
}

async function evaluateRun(prisma: PrismaClient, repository: PrismaRequirementAssessmentRepository, run: RequirementAssessmentRunRecord) {
  if (!run.evidenceSnapshotId) throw new Error("ASSESSMENT_SNAPSHOT_NOT_FOUND");
  const briefRow = await repository.findBrief(run, run.requirementId, run.requirementRevision);
  const snapshotRow = await repository.findSnapshot(run, run.evidenceSnapshotId);
  if (!briefRow || !snapshotRow) throw new Error("ASSESSMENT_EVIDENCE_NOT_FOUND");
  const result = await evaluateRequirement({ brief: briefFromRow(briefRow), snapshot: snapshotFromRow(snapshotRow), provider: new MockAIProvider(), rulesetRevision: snapshotRow.rulesetRevision });
  const assessmentId = `assessment-${run.requirementId}-${run.id}`;
  await repository.saveAssessmentRevision({ applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, enterpriseId: run.enterpriseId, id: assessmentId, requirementId: run.requirementId, revision: 1, lifecycle: "ASSESSED", verdict: result.verdict, confidence: result.confidence, evidenceCoverage: result.evidenceCoverage, evidenceSnapshotId: result.evidenceSnapshotId, designContextDigest: snapshotRow.contentDigest, canonicalSummary: `${result.verdict}: evidence coverage ${result.evidenceCoverage}`, localizedContent: { en: { summary: `${result.verdict}: evidence coverage ${result.evidenceCoverage}` }, zh: { summary: `${result.verdict}：证据覆盖率 ${result.evidenceCoverage}` } }, impactedFacts: result.impactRoots, hardConstraints: result.deterministicFindings.filter((finding) => finding.severity === "blocking"), solutionOptions: result.options, workBreakdown: result.workBreakdown, humanEstimate: { calibrationStatus: result.estimate.calibrationStatus, sizeClass: result.estimate.sizeClass }, aiEstimate: result.estimate, assumptions: result.assumptions, unknowns: result.unknowns, sensitivityFactors: result.estimate.sensitivity, reviewResult: {}, validAtWaterline: snapshotRow.validAtWaterline, contentDigest: digest(result) });
  return { assessmentId };
}

async function reviewRun(repository: PrismaRequirementAssessmentRepository, run: RequirementAssessmentRunRecord) {
  if (!run.assessmentId) throw new Error("ASSESSMENT_NOT_FOUND");
  await repository.markReviewed({ id: run.id, enterpriseId: run.enterpriseId, ...scope }, run.assessmentId, { status: "PASSED", provider: "mock", templateRevision: "mock-assessment-review-v1", reviewedAt: new Date().toISOString() });
}

function createEvidenceReader(prisma: PrismaClient): AssessmentEvidenceReader {
  return {
    async readCatalog(requestedScope) {
      const [rows, cursor] = await Promise.all([
        prisma.designAsset.findMany({ where: requestedScope, orderBy: [{ type: "asc" }, { id: "asc" }], take: 500 }),
        prisma.authoredCatalogCursor.findUnique({ where: { applicationServiceId_scopePath: requestedScope }, select: { nextVersion: true } })
      ]);
      return { catalogWaterline: cursor?.nextVersion?.toString() ?? "0", assets: rows.map((row) => ({ id: row.id, assetType: row.type, contentDigest: digest(row.payload), evidenceKinds: evidenceKinds(row.type), summary: { en: row.description, zh: row.description } })) };
    },
    async readRelationships(requestedScope) {
      const rows = await prisma.relationshipEvent.findMany({ where: requestedScope, orderBy: [{ graphVersion: "asc" }, { dbId: "asc" }], take: 500 });
      return { relationshipWaterline: rows.at(-1)?.graphVersion?.toString() ?? "0", complete: rows.length < 500, relationships: rows.map((row) => relationshipFromEvent(row.snapshot, row.dbId)) };
    },
    async readGovernance() {
      const reconciliationStatus = process.env.SPECFORGE_ASSESSMENT_RECONCILIATION_STATUS ?? "UNVERIFIED";
      return { authorizationDecisionRef: "assessment-worker-internal-scope-grant", authorizationAllowed: true, reconciliationStatus, rulesetRevision: "requirement-assessment-rules-v1", coveragePolicyRevision: "requirement-assessment-coverage-v1", blockers: reconciliationStatus === "CONVERGED" ? [] : [{ code: "DESIGN_RECONCILIATION_NOT_CONVERGED", title: { en: "Design reconciliation is not converged", zh: "设计对账尚未收敛" }, detail: { en: "Set the deployment reconciliation status only after the scoped catalog check passes.", zh: "只有精确 Scope 的目录检查通过后才能设置部署对账状态。" } }] };
    },
    async readProjection() { return { checkpoint: process.env.SPECFORGE_ASSESSMENT_PROJECTION_CHECKPOINT ?? null, status: "FALLBACK" as const, semanticsAvailable: false }; }
  };
}

function briefFromRow(row: Record<string, unknown>): RequirementBrief {
  const localized = asRecord(row.localizedContent);
  const intent = { en: stringValue(localized.en, row.canonicalIntent), zh: stringValue(localized.zh, row.canonicalIntent) };
  return { id: String(row.id), revision: Number(row.revision), intent, confirmedFacts: localizedArray(row.confirmedFacts), assumptions: localizedArray(row.assumptions), acceptanceCriteria: localizedArray(row.acceptanceCriteria), qualityTargets: localizedArray(row.qualityTargets), constraints: localizedArray(row.constraints), exclusions: localizedArray(row.exclusions), author: String(row.authorId), superseded: false, applicationServiceId: String(row.applicationServiceId), scopePath: String(row.scopePath) };
}

function snapshotFromRow(row: Record<string, unknown>) {
  const assets = asArray(row.orderedAssetManifest);
  const relationships = asArray(row.relationshipManifest);
  const kinds = new Set<string>(assets.flatMap((asset) => asArray(asRecord(asset).evidenceKinds).filter((item): item is string => typeof item === "string")));
  if (relationships.length > 0) kinds.add("relationship");
  if ((process.env.SPECFORGE_ASSESSMENT_RECONCILIATION_STATUS ?? "UNVERIFIED") === "CONVERGED") kinds.add("reconciliation");
  return { ...row, orderedAssetManifest: assets, relationshipManifest: relationships, governanceBlockers: [], evidenceKinds: [...kinds], projectionStatus: "FALLBACK", projectionSemanticsAvailable: false, reconciliationStatus: process.env.SPECFORGE_ASSESSMENT_RECONCILIATION_STATUS ?? "UNVERIFIED", authorizationAllowed: true } as never;
}
function relationshipFromEvent(value: unknown, fallbackId: string) { const row = asRecord(value); return { sourceType: String(row.sourceType ?? "unknown"), sourceId: String(row.sourceId ?? fallbackId), targetType: String(row.targetType ?? "unknown"), targetId: String(row.targetId ?? fallbackId), relationType: String(row.relationType ?? "RELATED_TO"), contentDigest: digest(row) }; }
function evidenceKinds(type: string): string[] { return type === "api" ? ["contract", "ownership", "quality"] : type === "dataModel" ? ["data", "ownership"] : type === "event" ? ["contract", "ownership"] : type === "businessRule" ? ["rule", "ownership"] : ["ownership", "intent"]; }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function asArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function localizedArray(value: unknown): Array<{ en: string; zh: string }> { return asArray(value).filter((item): item is { en: string; zh: string } => Boolean(item && typeof item === "object" && "en" in item && "zh" in item)); }
function stringValue(value: unknown, fallback: unknown): string { return typeof value === "string" ? value : typeof fallback === "string" ? fallback : ""; }
function digest(value: unknown): string { return `sha256:${createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex")}`; }
function number(value: unknown, fallback: number): number { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback; }
function errorCode(error: unknown): string { return error instanceof Error ? error.message.slice(0, 240) : "ASSESSMENT_WORKER_TICK_FAILED"; }

void main().catch((error) => { process.stderr.write(`ASSESSMENT_WORKER_STARTUP_FAILED:${errorCode(error)}\n`); process.exitCode = 1; });
