import type { AIProvider } from "../ai/types";
import { assertAssessmentUsableForImplementation, assertBilingualBrief, assertScopeMatch } from "./state";
import { deterministicCoverageFindings, evaluateEvidenceCoverage } from "./coverage";
import { estimateAiWork } from "./estimation";
import type {
  AgentExecutionProfile,
  AssessmentTaskInput,
  CalibrationState,
  DeterministicFinding,
  FeasibilityVerdict,
  LocalizedText,
  ModelProfile,
  RequirementBrief
} from "./types";
import type { AssessmentEvidenceSnapshot } from "./evidence";

export interface AssessmentEvaluation {
  briefId: string;
  briefRevision: number;
  scope: { applicationServiceId: string; scopePath: string };
  verdict: FeasibilityVerdict;
  lifecycle: "ASSESSED";
  confidence: number;
  evidenceCoverage: number;
  deterministicFindings: DeterministicFinding[];
  impactRoots: Array<{ assetType: string; assetId: string }>;
  assumptions: LocalizedText[];
  unknowns: LocalizedText[];
  options: Array<{ title: LocalizedText; summary: LocalizedText }>;
  workBreakdown: Array<{ kind: string; title: LocalizedText; complexity: number; risk: number; uncertainty: number }>;
  estimate: ReturnType<typeof estimateAiWork>;
  providerOutput: unknown;
  evidenceSnapshotId: string;
}

export async function evaluateRequirement(input: {
  brief: RequirementBrief;
  snapshot: AssessmentEvidenceSnapshot;
  provider: AIProvider;
  rulesetRevision: string;
  executionProfile?: AgentExecutionProfile;
  modelProfiles?: ModelProfile[];
  calibration?: CalibrationState;
}): Promise<AssessmentEvaluation> {
  assertBilingualBrief(input.brief);
  assertScopeMatch({ expected: input.brief, actual: input.snapshot });
  if (input.snapshot.rulesetRevision !== input.rulesetRevision) throw new Error("ASSESSMENT_RULESET_MISMATCH");

  const coverage = evaluateEvidenceCoverage({
    requirementKind: inferRequirementKind(input.brief),
    evidenceKinds: input.snapshot.evidenceKinds,
    policyRevision: input.snapshot.coveragePolicyRevision
  });
  const findings = deterministicCoverageFindings(coverage, input.snapshot.orderedAssetManifest.map((asset) => asset.id));
  const governanceFindings = input.snapshot.governanceBlockers.map((blocker) => ({ ...blocker, severity: "blocking" as const, evidenceIds: [] }));
  if (!input.snapshot.authorizationAllowed) {
    governanceFindings.push({
      code: "SCOPE_FORBIDDEN",
      severity: "blocking",
      title: { en: "Scope access is forbidden", zh: "Scope 无访问权限" },
      detail: { en: "The current actor cannot read this application-service Scope.", zh: "当前凭据不能读取该应用服务 Scope。" },
      evidenceIds: []
    });
  }
  if (input.snapshot.reconciliationStatus.toUpperCase() !== "CONVERGED") {
    governanceFindings.push({
      code: "DESIGN_RECONCILIATION_BLOCKED",
      severity: "blocking",
      title: { en: "Design reconciliation is not converged", zh: "设计对账尚未收敛" },
      detail: { en: "The assessment cannot authorize implementation while design facts are not converged.", zh: "设计事实未收敛时，评估不能授权实现。" },
      evidenceIds: []
    });
  }
  if (!input.snapshot.projectionSemanticsAvailable && input.snapshot.projectionStatus === "UNAVAILABLE") {
    findings.push({
      code: "PROJECTION_SEMANTICS_UNAVAILABLE",
      severity: "warning",
      title: { en: "Projection semantics are unavailable", zh: "投影语义不可用" },
      detail: { en: "The bounded PostgreSQL evidence path must be used or coverage remains incomplete.", zh: "必须使用有界 PostgreSQL 证据路径，否则覆盖率保持不完整。" },
      evidenceIds: []
    });
  }
  const allFindings = [...findings, ...governanceFindings];
  const tasks = buildTasks(input.snapshot);
  const executionProfile = input.executionProfile ?? defaultExecutionProfile();
  const estimate = estimateAiWork({
    tasks,
    executionProfile,
    modelProfiles: input.modelProfiles ?? [],
    calibration: input.calibration ?? { status: "HEURISTIC", sampleCount: 0, minimumSampleCount: 30, backtestPassed: false }
  });
  const providerOutput = await callProvider(input.provider, input.brief, input.snapshot);
  const blocking = allFindings.some((finding) => finding.severity === "blocking");
  const verdict: FeasibilityVerdict = blocking ? "BLOCKED" : coverage.coverage === 0 ? "INSUFFICIENT_EVIDENCE" : coverage.coverage < 1 ? "CONDITIONAL" : "FEASIBLE";
  const confidence = Math.min(coverage.confidenceCap, providerConfidence(providerOutput, 0.55));
  return {
    briefId: input.brief.id,
    briefRevision: input.brief.revision,
    scope: { applicationServiceId: input.snapshot.applicationServiceId, scopePath: input.snapshot.scopePath },
    verdict,
    lifecycle: "ASSESSED",
    confidence: round(confidence),
    evidenceCoverage: coverage.coverage,
    deterministicFindings: allFindings,
    impactRoots: input.snapshot.orderedAssetManifest.map((asset) => ({ assetType: asset.assetType, assetId: asset.id })),
    assumptions: [{ en: "The assessment uses the immutable evidence snapshot supplied by SpecForge.", zh: "评估使用 SpecForge 提供的不可变证据快照。" }],
    unknowns: coverage.missingKinds.map((kind) => ({ en: `Missing evidence: ${kind}`, zh: `缺少证据：${kind}` })),
    options: [{ title: { en: "Evidence-bounded implementation", zh: "基于证据边界的实现" }, summary: { en: "Implement only the covered change set and review unknowns first.", zh: "只实现已覆盖的变更集合，并先审查未知项。" } }],
    workBreakdown: tasks.map((task) => ({ ...task, title: { en: `Assess ${task.kind}`, zh: `评估 ${task.kind}` } })),
    estimate,
    providerOutput,
    evidenceSnapshotId: input.snapshot.id
  };
}

function inferRequirementKind(brief: RequirementBrief): string {
  const text = `${brief.intent.en} ${brief.intent.zh}`.toLowerCase();
  if (text.includes("api") || text.includes("接口")) return "api";
  if (text.includes("event") || text.includes("事件")) return "event";
  if (text.includes("model") || text.includes("模型")) return "data-model";
  if (text.includes("rule") || text.includes("规则")) return "rule";
  return "generic";
}

function buildTasks(snapshot: AssessmentEvidenceSnapshot): AssessmentTaskInput[] {
  const assets = snapshot.orderedAssetManifest;
  return assets.length > 0
    ? assets.slice(0, 50).map((asset) => ({ kind: asset.assetType, complexity: asset.revision ? Math.min(1, asset.revision / 10) : 0.35, risk: snapshot.relationshipManifest.length > 0 ? 0.45 : 0.25, uncertainty: asset.evidenceKinds?.length ? 0.2 : 0.8 }))
    : [{ kind: "evidence-resolution", complexity: 0.5, risk: 0.5, uncertainty: 1 }];
}

async function callProvider(provider: AIProvider, brief: RequirementBrief, snapshot: AssessmentEvidenceSnapshot): Promise<unknown> {
  try {
    const response = await provider.generate({
      capability: "requirementAssessment",
      prompt: brief.intent.en,
      context: { evidenceSnapshotId: snapshot.id, assetIds: snapshot.orderedAssetManifest.map((asset) => asset.id), relationshipCount: snapshot.relationshipManifest.length }
    });
    return response.content;
  } catch (error) {
    throw new Error(`ASSESSMENT_PROVIDER_FAILED:${error instanceof Error ? error.message : "unknown"}`);
  }
}

function providerConfidence(output: unknown, fallback: number): number {
  if (!output || typeof output !== "object") return fallback;
  const value = (output as Record<string, unknown>).confidence;
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function defaultExecutionProfile(): AgentExecutionProfile {
  return { id: "agent-reference", revision: 1, primaryModelProfileId: "model-primary", reviewModelProfileId: "model-review", maxContextTokens: 32_000, maxOutputTokens: 8_000, maxRepairLoops: 2, maxToolCalls: 20, hardTokenBudget: 100_000, stopOnBudgetExceeded: true };
}

function round(value: number): number { return Math.round(value * 1000) / 1000; }
