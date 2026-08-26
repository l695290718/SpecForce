import type {
  AssessmentEvidenceKind,
  AssessmentRequirementKind,
  DeterministicFinding,
  EvidenceCoverageResult,
  LocalizedText
} from "./types";

const policies: Record<AssessmentRequirementKind, readonly string[]> = {
  api: ["contract", "caller", "data", "compatibility", "test", "quality", "ownership"],
  "data-model": ["data", "relationship", "migration", "test", "quality", "ownership"],
  event: ["contract", "producer", "consumer", "compatibility", "test", "quality", "ownership"],
  rule: ["rule", "state", "test", "quality", "ownership"],
  generic: ["intent", "impact", "acceptance", "quality", "ownership"]
};

export function requiredEvidenceKinds(requirementKind: string): readonly string[] {
  return policies[normalizeRequirementKind(requirementKind)] ?? policies.generic;
}

export function evaluateEvidenceCoverage(input: {
  requirementKind: string;
  evidenceKinds: AssessmentEvidenceKind[];
  policyRevision: string;
}): EvidenceCoverageResult {
  const requiredKinds = [...requiredEvidenceKinds(input.requirementKind)];
  const available = new Set(input.evidenceKinds.map(normalizeEvidenceKind));
  const matchedKinds = requiredKinds.filter((kind) => available.has(kind));
  const missingKinds = requiredKinds.filter((kind) => !available.has(kind));
  const coverage = round(matchedKinds.length / requiredKinds.length);
  return {
    coverage,
    confidenceCap: coverage === 1 ? 1 : round(Math.max(0.2, coverage)),
    missingKinds,
    policyRevision: input.policyRevision,
    requiredKinds,
    matchedKinds
  };
}

export function deterministicCoverageFindings(
  coverage: EvidenceCoverageResult,
  evidenceIds: string[] = []
): DeterministicFinding[] {
  if (coverage.missingKinds.length === 0) return [];
  const title: LocalizedText = { en: "Evidence coverage is incomplete", zh: "证据覆盖不完整" };
  const detail: LocalizedText = {
    en: `Missing mandatory evidence kinds: ${coverage.missingKinds.join(", ")}.`,
    zh: `缺少必需证据类型：${coverage.missingKinds.join("、")}。`
  };
  return [{
    code: "EVIDENCE_COVERAGE_INCOMPLETE",
    severity: coverage.coverage === 0 ? "blocking" : "warning",
    title,
    detail,
    evidenceIds
  }];
}

function normalizeRequirementKind(value: string): AssessmentRequirementKind {
  const normalized = value.trim().toLowerCase();
  return normalized === "data" || normalized === "model" ? "data-model" :
    normalized === "business-rule" ? "rule" :
    (normalized as AssessmentRequirementKind) in policies ? normalized as AssessmentRequirementKind : "generic";
}

function normalizeEvidenceKind(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s]+/g, "-");
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
