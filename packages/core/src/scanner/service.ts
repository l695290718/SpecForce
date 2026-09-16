import { contentDigest } from "../federation/digest";
import type { ArchitectureScopeRef } from "../architecture/types";
import { classifyScanFile, defaultScanCoveragePolicy, scanCoveragePolicyDigest, type ScanCoveragePolicy } from "./coverage-policy";
import type { LocalFileSnapshot, ScanManifestEntry, ScanObservation, ScanReport, ScannerObservationType, ScannerSourceKind } from "./types";

const extensionLanguages: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".jsx": "javascript", ".go": "go", ".java": "java", ".kt": "kotlin", ".py": "python", ".rs": "rust", ".cs": "csharp", ".sh": "shell", ".ps1": "powershell", ".sql": "sql", ".ngql": "ngql", ".yaml": "yaml", ".yml": "yaml", ".json": "json", ".md": "markdown", ".xml": "xml", ".proto": "protobuf"
};

const ignoredPath = /(^|\\|\/)(\.git|\.pnpm-store|\.specforge|\.worktrees|node_modules|vendor|dist|build|coverage|\.next|target)(\\|\/|$)/i;
const supportedPath = /(^|\\|\/)(Dockerfile|[^\\/]+\.Dockerfile(?:\.dockerignore)?|docker-compose[^\\/]*\.(ya?ml)|compose[^\\/]*\.(ya?ml)|\.github\/workflows\/[^\\/]+\.(ya?ml)|\.gitlab-ci\.ya?ml|(?:charts|helm|k8s|kubernetes|deploy)\/.*\.(ya?ml)|package\.json|pom\.xml|build\.gradle(?:\.kts)?|go\.mod|Cargo\.toml|pyproject\.toml|openapi[^\\/]*\.(json|ya?ml)|asyncapi[^\\/]*\.(json|ya?ml)|schema\.prisma|.*\.(ts|tsx|js|mjs|cjs|jsx|go|java|kt|py|rs|cs|proto|sql|ngql|sh|ps1|md))$/i;

export function scanFilePath(path: string): { language?: string; sourceKind: ScannerSourceKind; observationType?: ScannerObservationType } | undefined {
  const normalized = normalizeRelativePath(path);
  if (ignoredPath.test(normalized) || !supportedPath.test(normalized)) return undefined;
  const lower = normalized.toLowerCase();
  const extension = lower.includes(".") ? `.${lower.split(".").pop()}` : "";
  const language = extensionLanguages[extension];
  if (/openapi[^/]*\.(json|yaml|yml)$/.test(lower)) return { language, sourceKind: "openapi", observationType: "api-contract" };
  if (/asyncapi[^/]*\.(json|yaml|yml)$/.test(lower)) return { language, sourceKind: "asyncapi", observationType: "event-contract" };
  if (lower.endsWith("schema.prisma") || lower.endsWith(".sql") || lower.endsWith(".ngql")) return { language, sourceKind: "database", observationType: "data-model" };
  if (lower.endsWith(".md")) return { language, sourceKind: "document", observationType: "documentation" };
  if (/dockerfile(?:\.dockerignore)?$|docker-compose[^/]*\.(yaml|yml)$|compose[^/]*\.(yaml|yml)$|\.github\/workflows\/[^/]+\.(yaml|yml)$|\.gitlab-ci\.(yaml|yml)$|(?:charts|helm|k8s|kubernetes|deploy)\/.*\.(yaml|yml|sh|ps1|mjs|cjs)$|package\.json$|pom\.xml$|build\.gradle(?:\.kts)?$|go\.mod$|cargo\.toml$|pyproject\.toml$/.test(lower)) return { language, sourceKind: "repository", observationType: "system-component" };
  return { language, sourceKind: "repository", observationType: "source-file" };
}

export function buildScanReport(input: { rootLabel: string; architectureScope: ArchitectureScopeRef; files: LocalFileSnapshot[]; scannerId?: string; scannerVersion?: string; generatedAt?: string; coveragePolicy?: ScanCoveragePolicy }): ScanReport {
  const manifest: ScanManifestEntry[] = [];
  const observations: ScanObservation[] = [];
  const policy = input.coveragePolicy ?? defaultScanCoveragePolicy;
  let excludedFiles = 0;
  let outOfPolicyFiles = 0;
  let requiredUnsupportedFiles = 0;
  const blockingRuleIds = new Set<string>();
  const classifiedEntries: Array<{ path: string; classification: "EXCLUDED" | "REQUIRED_UNSUPPORTED" | "OUT_OF_POLICY"; ruleId: string }> = [];
  const sourceKinds: Record<ScannerSourceKind, number> = { repository: 0, openapi: 0, asyncapi: 0, database: 0, document: 0 };
  for (const file of [...input.files].sort((left, right) => normalizeRelativePath(left.path).localeCompare(normalizeRelativePath(right.path)))) {
    const descriptor = scanFilePath(file.path);
    const path = normalizeRelativePath(file.path);
    const classification = classifyScanFile(path, Boolean(descriptor), policy);
    if (classification.classification !== "SUPPORTED") {
      if (classification.classification === "EXCLUDED") excludedFiles += 1;
      if (classification.classification === "OUT_OF_POLICY") outOfPolicyFiles += 1;
      if (classification.classification === "REQUIRED_UNSUPPORTED") {
        requiredUnsupportedFiles += 1;
        blockingRuleIds.add(classification.ruleId);
      }
      classifiedEntries.push({ path, classification: classification.classification, ruleId: classification.ruleId });
      continue;
    }
    if (!descriptor) throw new Error("SCAN_POLICY_SUPPORTED_PATH_UNCLASSIFIED");
    const digest = contentDigest({ path, content: file.content });
    const entry = { path, sizeBytes: file.sizeBytes, digest, ...(descriptor.language ? { language: descriptor.language } : {}), sourceKind: descriptor.sourceKind } satisfies ScanManifestEntry;
    manifest.push(entry);
    sourceKinds[descriptor.sourceKind] += 1;
    if (descriptor.observationType) {
      const payload = { path, sizeBytes: file.sizeBytes, digest, language: descriptor.language ?? "unknown", sourceKind: descriptor.sourceKind };
      observations.push({ id: `observation:${digest}`, observationType: descriptor.observationType, sourcePath: path, payload, normalizedDigest: contentDigest(payload) });
    }
  }
  const manifestDigest = contentDigest(manifest);
  const skippedFiles = excludedFiles + outOfPolicyFiles + requiredUnsupportedFiles;
  const priority: Record<"EXCLUDED" | "REQUIRED_UNSUPPORTED" | "OUT_OF_POLICY", number> = { REQUIRED_UNSUPPORTED: 0, OUT_OF_POLICY: 1, EXCLUDED: 2 };
  const representativeEntries = classifiedEntries.sort((left, right) => priority[left.classification] - priority[right.classification] || left.path.localeCompare(right.path)).slice(0, 50);
  const coverage = { totalFiles: input.files.length, indexedFiles: manifest.length, skippedFiles, unsupportedFiles: requiredUnsupportedFiles, observationCount: observations.length, sourceKinds, policyId: policy.id, policyVersion: policy.version, policyDigest: scanCoveragePolicyDigest(policy), excludedFiles, outOfPolicyFiles, requiredUnsupportedFiles, blockingRuleIds: [...blockingRuleIds].sort(), representativeEntries, complete: requiredUnsupportedFiles === 0 };
  const reportBase = { scannerId: input.scannerId ?? "specforge-local-scanner", scannerVersion: input.scannerVersion ?? "1", rootLabel: input.rootLabel, architectureScope: input.architectureScope, manifest, observations, coverage, manifestDigest, generatedAt: input.generatedAt ?? "2026-01-01T00:00:00.000Z" };
  const { generatedAt: _generatedAt, ...deterministicReport } = reportBase;
  return { ...reportBase, reportDigest: contentDigest(deterministicReport) };
}

export function normalizeRelativePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function validateScanReport(report: ScanReport): void {
  if (!report.scannerId || !report.scannerVersion || !report.rootLabel || !report.architectureScope.applicationServiceId || !report.architectureScope.scopePath) throw new Error("SCAN_REPORT_IDENTITY_REQUIRED");
  if (report.coverage.indexedFiles !== report.manifest.length || report.coverage.observationCount !== report.observations.length) throw new Error("SCAN_REPORT_COVERAGE_MISMATCH");
  if (!report.coverage.policyId || !report.coverage.policyVersion || !/^[0-9a-f]{64}$/i.test(report.coverage.policyDigest)) throw new Error("SCAN_REPORT_POLICY_INVALID");
  if (report.coverage.skippedFiles !== report.coverage.excludedFiles + report.coverage.outOfPolicyFiles + report.coverage.requiredUnsupportedFiles || report.coverage.unsupportedFiles !== report.coverage.requiredUnsupportedFiles || report.coverage.complete !== (report.coverage.requiredUnsupportedFiles === 0)) throw new Error("SCAN_REPORT_CLASSIFICATION_MISMATCH");
  if (contentDigest(report.manifest) !== report.manifestDigest) throw new Error("SCAN_REPORT_MANIFEST_DIGEST_INVALID");
  const { generatedAt: _generatedAt, reportDigest: _reportDigest, ...reportContent } = report;
  if (contentDigest(reportContent) !== report.reportDigest) throw new Error("SCAN_REPORT_DIGEST_INVALID");
  const observationIds = new Set<string>();
  for (const observation of report.observations) {
    if (observationIds.has(observation.id)) throw new Error("SCAN_REPORT_OBSERVATION_DUPLICATE");
    observationIds.add(observation.id);
    if (contentDigest(observation.payload) !== observation.normalizedDigest) throw new Error("SCAN_OBSERVATION_DIGEST_INVALID");
  }
}
