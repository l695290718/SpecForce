import type { ArchitectureScopeRef } from "../architecture/types";
import { contentDigest } from "../federation/digest";
import type { AnalysisProfile } from "./types";
import { assertAnalysisProfile } from "./profiles";
import type { Baseline, ChangeSet, KnowledgeAssertion, ProjectionManifest } from "./types";

export function assertExactScope(actual: ArchitectureScopeRef, expected: ArchitectureScopeRef): void {
  if (actual.applicationServiceId !== expected.applicationServiceId || actual.scopePath !== expected.scopePath) {
    throw new Error("SCOPE_MISMATCH");
  }
}

export function validateKnowledgeAssertion(assertion: KnowledgeAssertion, profile: AnalysisProfile): void {
  if (!assertion.id || !assertion.semanticIdentity || !assertion.factType || !assertion.extractorId) {
    throw new Error("KNOWLEDGE_ASSERTION_IDENTITY_REQUIRED");
  }
  assertAnalysisProfile(profile, assertion.layer, assertion.aspect);
  if (!Number.isFinite(assertion.confidence) || assertion.confidence < 0 || assertion.confidence > 1) {
    throw new Error("KNOWLEDGE_ASSERTION_CONFIDENCE_INVALID");
  }
  if (!Array.isArray(assertion.evidenceRefs) || assertion.evidenceRefs.length === 0) {
    throw new Error("KNOWLEDGE_ASSERTION_EVIDENCE_REQUIRED");
  }
}

export function changeSetDigest(input: Pick<ChangeSet, "architectureScope" | "streamId" | "sequence" | "assetRevisionIds" | "relationshipRevisionIds" | "evidenceRefs">): string {
  return contentDigest(input);
}

export function projectionManifestDigest(input: Pick<ProjectionManifest, "architectureScope" | "baselineId" | "projectionType" | "projectionSchemaVersion" | "sourceRevisionIds" | "relationshipVersion" | "query">): string {
  return contentDigest(input);
}

export function assertBaselinePublishable(baseline: Pick<Baseline, "status" | "manifest">, reconciliationStatus: "CONVERGED" | "DRIFTED" | "BLOCKED"): void {
  if (baseline.status !== "PUBLISHED") throw new Error("BASELINE_STATUS_INVALID");
  if (reconciliationStatus !== "CONVERGED") throw new Error(`BASELINE_RECONCILIATION_${reconciliationStatus}`);
  if (!baseline.manifest.changeSetId || baseline.manifest.sourceRevisionIds.length === 0) {
    throw new Error("BASELINE_MANIFEST_INCOMPLETE");
  }
}
