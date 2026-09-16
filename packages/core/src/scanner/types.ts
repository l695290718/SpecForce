import type { ArchitectureScopeRef } from "../architecture/types";

export type ScannerSourceKind = "repository" | "openapi" | "asyncapi" | "database" | "document";
export type ScannerObservationType = "source-file" | "system-component" | "api-contract" | "event-contract" | "data-model" | "documentation";

export interface ScanManifestEntry {
  path: string;
  sizeBytes: number;
  digest: string;
  language?: string;
  sourceKind: ScannerSourceKind;
}

export interface ScanObservation {
  id: string;
  observationType: ScannerObservationType;
  sourcePath: string;
  payload: Record<string, unknown>;
  normalizedDigest: string;
}

export interface ScanCoverage {
  totalFiles: number;
  indexedFiles: number;
  skippedFiles: number;
  unsupportedFiles: number;
  observationCount: number;
  sourceKinds: Record<ScannerSourceKind, number>;
  policyId: string;
  policyVersion: string;
  policyDigest: string;
  excludedFiles: number;
  outOfPolicyFiles: number;
  requiredUnsupportedFiles: number;
  blockingRuleIds: string[];
  representativeEntries: Array<{ path: string; classification: "EXCLUDED" | "REQUIRED_UNSUPPORTED" | "OUT_OF_POLICY"; ruleId: string }>;
  complete: boolean;
}

export interface ScanReport {
  scannerId: string;
  scannerVersion: string;
  rootLabel: string;
  architectureScope: ArchitectureScopeRef;
  manifest: ScanManifestEntry[];
  observations: ScanObservation[];
  coverage: ScanCoverage;
  manifestDigest: string;
  reportDigest: string;
  generatedAt: string;
}

export interface PersistedScanReport extends Omit<ScanReport, "observations"> {
  id: string;
  designChangeSessionId: string;
  observationIds: string[];
  status: "RECEIVED" | "BLOCKED";
}

export interface LocalFileSnapshot {
  path: string;
  content: string;
  sizeBytes: number;
}
