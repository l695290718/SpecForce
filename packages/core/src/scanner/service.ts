import { contentDigest } from "../federation/digest";
import type { ArchitectureScopeRef } from "../architecture/types";
import type { LocalFileSnapshot, ScanManifestEntry, ScanObservation, ScanReport, ScannerObservationType, ScannerSourceKind } from "./types";

const extensionLanguages: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript", ".go": "go", ".java": "java", ".kt": "kotlin", ".py": "python", ".rs": "rust", ".cs": "csharp", ".sql": "sql", ".yaml": "yaml", ".yml": "yaml", ".json": "json", ".md": "markdown", ".xml": "xml", ".proto": "protobuf"
};

const ignoredPath = /(^|\\|\/)(\.git|node_modules|vendor|dist|build|coverage|\.next|target)(\\|\/)/i;
const supportedPath = /(^|\\|\/)(package\.json|pom\.xml|build\.gradle(?:\.kts)?|go\.mod|Cargo\.toml|pyproject\.toml|openapi[^\\/]*\.(json|ya?ml)|asyncapi[^\\/]*\.(json|ya?ml)|schema\.prisma|.*\.(ts|tsx|js|jsx|go|java|kt|py|rs|cs|proto|sql|md))$/i;

export function scanFilePath(path: string): { language?: string; sourceKind: ScannerSourceKind; observationType?: ScannerObservationType } | undefined {
  const normalized = normalizeRelativePath(path);
  if (ignoredPath.test(normalized) || !supportedPath.test(normalized)) return undefined;
  const lower = normalized.toLowerCase();
  const extension = lower.includes(".") ? `.${lower.split(".").pop()}` : "";
  const language = extensionLanguages[extension];
  if (/openapi[^/]*\.(json|yaml|yml)$/.test(lower)) return { language, sourceKind: "openapi", observationType: "api-contract" };
  if (/asyncapi[^/]*\.(json|yaml|yml)$/.test(lower)) return { language, sourceKind: "asyncapi", observationType: "event-contract" };
  if (lower.endsWith("schema.prisma") || lower.endsWith(".sql")) return { language, sourceKind: "database", observationType: "data-model" };
  if (lower.endsWith(".md")) return { language, sourceKind: "document", observationType: "documentation" };
  if (/package\.json$|pom\.xml$|build\.gradle(?:\.kts)?$|go\.mod$|cargo\.toml$|pyproject\.toml$/.test(lower)) return { language, sourceKind: "repository", observationType: "system-component" };
  return { language, sourceKind: "repository", observationType: "source-file" };
}

export function buildScanReport(input: { rootLabel: string; architectureScope: ArchitectureScopeRef; files: LocalFileSnapshot[]; scannerId?: string; scannerVersion?: string; generatedAt?: string }): ScanReport {
  const manifest: ScanManifestEntry[] = [];
  const observations: ScanObservation[] = [];
  let skippedFiles = 0;
  const sourceKinds: Record<ScannerSourceKind, number> = { repository: 0, openapi: 0, asyncapi: 0, database: 0, document: 0 };
  for (const file of [...input.files].sort((left, right) => normalizeRelativePath(left.path).localeCompare(normalizeRelativePath(right.path)))) {
    const descriptor = scanFilePath(file.path);
    if (!descriptor) { skippedFiles += 1; continue; }
    const path = normalizeRelativePath(file.path);
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
  const coverage = { totalFiles: input.files.length, indexedFiles: manifest.length, skippedFiles, unsupportedFiles: skippedFiles, observationCount: observations.length, sourceKinds, complete: skippedFiles === 0 };
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
