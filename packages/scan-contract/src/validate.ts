import type {
  ArchitectureScope,
  AssetCoveragePlan,
  KnowledgeScanBatch,
  ScanFinalization,
  ScanPolicyReceipt,
  ScanSessionDescriptor,
  ScannerReleaseManifest,
  SourceObservationV2,
  TechnologyProfile
} from "./generated";

export const SCAN_LIMITS = Object.freeze({
  maxObservationsPerBatch: 500,
  maxBatchBytes: 4_194_304,
  maxExcerptBytes: 8_192,
  maxSourceFileBytes: 10_485_760,
  maxObservationsPerSession: 100_000
});

const encoder = new TextEncoder();
const sha256Pattern = /^[0-9a-f]{64}$/;
const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function validateScanSession(value: unknown): ScanSessionDescriptor {
  const session = strictRecord(value, "SCAN_SESSION_INVALID", [
    "contractVersion", "sessionId", "architectureScope", "actorId", "connectorId", "scannerReleaseId", "sessionNonce", "expiresAt", "repositoryPolicy", "limits", "policyReceipt", "technologyProfile", "coveragePlan", "expectedPreviousBatchDigest"
  ]);
  contractVersion(session.contractVersion);
  nonEmptyString(session.sessionId, "SCAN_SESSION_ID_REQUIRED");
  validateScope(session.architectureScope);
  nonEmptyString(session.actorId, "SCAN_SESSION_ACTOR_REQUIRED");
  nonEmptyString(session.connectorId, "SCAN_SESSION_CONNECTOR_REQUIRED");
  nonEmptyString(session.scannerReleaseId, "SCAN_SESSION_RELEASE_REQUIRED");
  if (nonEmptyString(session.sessionNonce, "SCAN_SESSION_NONCE_REQUIRED").length < 16) throw new Error("SCAN_SESSION_NONCE_INVALID");
  dateTime(session.expiresAt, "SCAN_SESSION_EXPIRY_INVALID");

  const policy = strictRecord(session.repositoryPolicy, "REPOSITORY_POLICY_INVALID", ["allowDirtyWorktree", "ignorePatterns"]);
  booleanValue(policy.allowDirtyWorktree, "REPOSITORY_POLICY_INVALID");
  stringArray(policy.ignorePatterns, "REPOSITORY_POLICY_INVALID");

  const limits = strictRecord(session.limits, "SCAN_LIMITS_INVALID", Object.keys(SCAN_LIMITS));
  for (const [key, ceiling] of Object.entries(SCAN_LIMITS)) {
    const limit = integer(limits[key], "SCAN_LIMITS_INVALID");
    const minimum = key === "maxExcerptBytes" ? 0 : 1;
    if (limit < minimum || limit > ceiling) throw new Error("SCAN_LIMITS_EXCEEDED");
  }
  validatePolicyReceipt(session.policyReceipt);
  validateTechnologyProfile(session.technologyProfile);
  validateCoveragePlan(session.coveragePlan);
  nullableSha256(session.expectedPreviousBatchDigest, "SCAN_PREVIOUS_DIGEST_INVALID");
  return session as unknown as ScanSessionDescriptor;
}

export function validateScanBatch(
  value: unknown,
  expected?: ArchitectureScope | Pick<ScanSessionDescriptor, "architectureScope" | "sessionId">
): KnowledgeScanBatch {
  const batch = strictRecord(value, "SCAN_BATCH_INVALID", [
    "contractVersion", "sessionId", "sequence", "previousBatchDigest", "sessionNonceDigest", "architectureScope", "observations", "coverageDelta", "batchDigest"
  ]);
  contractVersion(batch.contractVersion);
  nonEmptyString(batch.sessionId, "SCAN_BATCH_SESSION_REQUIRED");
  const sequence = integer(batch.sequence, "SCAN_BATCH_SEQUENCE_INVALID");
  if (sequence < 0) throw new Error("SCAN_BATCH_SEQUENCE_INVALID");
  nullableSha256(batch.previousBatchDigest, "SCAN_PREVIOUS_DIGEST_INVALID");
  sha256(batch.sessionNonceDigest, "SCAN_NONCE_DIGEST_INVALID");
  const scope = validateScope(batch.architectureScope);
  assertExpectedScope(scope, batch.sessionId as string, expected);

  if (!Array.isArray(batch.observations)) throw new Error("SCAN_OBSERVATIONS_INVALID");
  if (batch.observations.length > SCAN_LIMITS.maxObservationsPerBatch) throw new Error("SCAN_BATCH_OBSERVATION_LIMIT_EXCEEDED");
  batch.observations.forEach(validateObservation);

  const coverage = strictRecord(batch.coverageDelta, "SCAN_COVERAGE_INVALID", ["indexedFiles", "skippedFiles", "observationCount", "coverageGaps"]);
  nonNegativeInteger(coverage.indexedFiles, "SCAN_COVERAGE_INVALID");
  nonNegativeInteger(coverage.skippedFiles, "SCAN_COVERAGE_INVALID");
  if (nonNegativeInteger(coverage.observationCount, "SCAN_COVERAGE_INVALID") !== batch.observations.length) throw new Error("SCAN_BATCH_COVERAGE_MISMATCH");
  stringArray(coverage.coverageGaps, "SCAN_COVERAGE_INVALID");
  sha256(batch.batchDigest, "SCAN_BATCH_DIGEST_INVALID");

  if (canonicalJsonBytes(batch).byteLength > SCAN_LIMITS.maxBatchBytes) throw new Error("SCAN_BATCH_BYTE_LIMIT_EXCEEDED");
  return batch as unknown as KnowledgeScanBatch;
}

export function validateScanFinalization(value: unknown): ScanFinalization {
  const finalization = strictRecord(value, "SCAN_FINALIZATION_INVALID", [
    "contractVersion", "sessionId", "architectureScope", "repositorySnapshotDigest", "manifestDigest", "finalBatchDigest", "batchCount", "observationCount", "coverage", "coveragePlan", "policyReceipt", "generatedAt"
  ]);
  contractVersion(finalization.contractVersion);
  nonEmptyString(finalization.sessionId, "SCAN_FINALIZATION_INVALID");
  validateScope(finalization.architectureScope);
  sha256(finalization.repositorySnapshotDigest, "SCAN_FINALIZATION_DIGEST_INVALID");
  sha256(finalization.manifestDigest, "SCAN_FINALIZATION_DIGEST_INVALID");
  sha256(finalization.finalBatchDigest, "SCAN_FINALIZATION_DIGEST_INVALID");
  nonNegativeInteger(finalization.batchCount, "SCAN_FINALIZATION_INVALID");
  nonNegativeInteger(finalization.observationCount, "SCAN_FINALIZATION_INVALID");
  validateCoverageDelta(finalization.coverage);
  validateCoveragePlan(finalization.coveragePlan);
  validatePolicyReceipt(finalization.policyReceipt);
  dateTime(finalization.generatedAt, "SCAN_FINALIZATION_INVALID");
  return finalization as unknown as ScanFinalization;
}

function validateCoverageDelta(value: unknown): { indexedFiles: number; skippedFiles: number; observationCount: number; coverageGaps: string[] } {
  const coverage = strictRecord(value, "SCAN_COVERAGE_INVALID", ["indexedFiles", "skippedFiles", "observationCount", "coverageGaps"]);
  const indexedFiles = nonNegativeInteger(coverage.indexedFiles, "SCAN_COVERAGE_INVALID");
  const skippedFiles = nonNegativeInteger(coverage.skippedFiles, "SCAN_COVERAGE_INVALID");
  const observationCount = nonNegativeInteger(coverage.observationCount, "SCAN_COVERAGE_INVALID");
  const coverageGaps = stringArray(coverage.coverageGaps, "SCAN_COVERAGE_INVALID");
  return { indexedFiles, skippedFiles, observationCount, coverageGaps };
}

export function validateScannerRelease(value: unknown): ScannerReleaseManifest {
  const release = strictRecord(value, "SCANNER_RELEASE_INVALID", [
    "contractVersion", "releaseId", "scannerVersion", "platform", "artifactKind", "architecture", "artifact", "runtime", "entrypoint", "schemaVersions", "extractors", "signingKeyId", "algorithm", "issuedAt", "expiresAt", "status", "signature"
  ], ["artifactKind", "architecture", "runtime", "entrypoint"]);
  contractVersion(release.contractVersion);
  nonEmptyString(release.releaseId, "SCANNER_RELEASE_ID_REQUIRED");
  nonEmptyString(release.scannerVersion, "SCANNER_VERSION_REQUIRED");
  nonEmptyString(release.platform, "SCANNER_PLATFORM_REQUIRED");

  const artifactKind = release.artifactKind ?? "NATIVE_BINARY";
  enumValue(artifactKind, ["PORTABLE_SCRIPT", "NATIVE_BINARY"], "SCANNER_ARTIFACT_KIND_INVALID");
  if (release.architecture !== undefined) nonEmptyString(release.architecture, "SCANNER_ARCHITECTURE_INVALID");
  if (release.entrypoint !== undefined) nonEmptyString(release.entrypoint, "SCANNER_ENTRYPOINT_INVALID");
  if (release.runtime !== undefined) {
    const runtime = strictRecord(release.runtime, "SCANNER_RUNTIME_INVALID", ["name", "versionRange"]);
    if (runtime.name !== "node") throw new Error("SCANNER_RUNTIME_INVALID");
    nonEmptyString(runtime.versionRange, "SCANNER_RUNTIME_INVALID");
  }
  if (artifactKind === "PORTABLE_SCRIPT") {
    if (release.platform !== "any" || release.architecture !== "any") throw new Error("SCANNER_PORTABLE_PLATFORM_INVALID");
    if (!release.runtime || !release.entrypoint) throw new Error("SCANNER_PORTABLE_RUNTIME_REQUIRED");
  }

  const artifact = strictRecord(release.artifact, "SCANNER_ARTIFACT_INVALID", ["uri", "sha256", "sizeBytes"]);
  nonEmptyString(artifact.uri, "SCANNER_ARTIFACT_INVALID");
  sha256(artifact.sha256, "SCANNER_ARTIFACT_DIGEST_INVALID");
  if (integer(artifact.sizeBytes, "SCANNER_ARTIFACT_INVALID") < 1) throw new Error("SCANNER_ARTIFACT_INVALID");

  const schemaVersions = stringArray(release.schemaVersions, "SCANNER_SCHEMA_VERSIONS_INVALID");
  if (!schemaVersions.includes("2.0") || new Set(schemaVersions).size !== schemaVersions.length) throw new Error("SCANNER_SCHEMA_VERSIONS_INVALID");
  if (!Array.isArray(release.extractors)) throw new Error("SCANNER_EXTRACTORS_INVALID");
  for (const extractorValue of release.extractors) {
    const extractor = strictRecord(extractorValue, "SCANNER_EXTRACTORS_INVALID", ["id", "version"]);
    nonEmptyString(extractor.id, "SCANNER_EXTRACTORS_INVALID");
    nonEmptyString(extractor.version, "SCANNER_EXTRACTORS_INVALID");
  }
  nonEmptyString(release.signingKeyId, "SCANNER_SIGNING_KEY_REQUIRED");
  if (release.algorithm !== "Ed25519") throw new Error("SCANNER_SIGNATURE_ALGORITHM_INVALID");
  dateTime(release.issuedAt, "SCANNER_RELEASE_TIME_INVALID");
  dateTime(release.expiresAt, "SCANNER_RELEASE_TIME_INVALID");
  if (!(["ACTIVE", "REVOKED", "RETIRED"] as unknown[]).includes(release.status)) throw new Error("SCANNER_RELEASE_STATUS_INVALID");
  const signature = nonEmptyString(release.signature, "SCANNER_SIGNATURE_REQUIRED");
  if (!base64Pattern.test(signature) || decodeBase64(signature).byteLength !== 64) throw new Error("SCANNER_SIGNATURE_INVALID");
  return release as unknown as ScannerReleaseManifest;
}

export function canonicalUnsignedRelease(value: unknown): Uint8Array {
  const release = validateScannerRelease(value);
  const { signature: _signature, ...unsigned } = release;
  return canonicalJsonBytes(unsigned);
}

export async function verifyScannerRelease(value: unknown, trustedRawPublicKeyBase64: string): Promise<boolean> {
  const release = validateScannerRelease(value);
  if (!base64Pattern.test(trustedRawPublicKeyBase64)) throw new Error("SCANNER_TRUST_KEY_INVALID");
  const rawKey = decodeBase64(trustedRawPublicKeyBase64);
  if (rawKey.byteLength !== 32) throw new Error("SCANNER_TRUST_KEY_INVALID");
  const publicKey = await globalThis.crypto.subtle.importKey("raw", arrayBuffer(rawKey), "Ed25519", false, ["verify"]);
  return globalThis.crypto.subtle.verify("Ed25519", publicKey, arrayBuffer(decodeBase64(release.signature)), arrayBuffer(canonicalUnsignedRelease(release)));
}

function validatePolicyReceipt(value: unknown): asserts value is ScanPolicyReceipt {
  const receipt = strictRecord(value, "SCAN_POLICY_RECEIPT_INVALID", ["systemGovernanceDigest", "extractorCatalogDigest", "semanticPromptPackDigest", "scopeRuntimeProfileDigest", "effectivePolicyDigest"]);
  for (const key of Object.keys(receipt)) sha256(receipt[key], "SCAN_POLICY_RECEIPT_INVALID");
}

function validateTechnologyProfile(value: unknown): asserts value is TechnologyProfile {
  const profile = strictRecord(value, "SCAN_TECHNOLOGY_PROFILE_INVALID", ["detections", "conflicts", "digest"]);
  if (!Array.isArray(profile.detections)) throw new Error("SCAN_TECHNOLOGY_PROFILE_INVALID");
  for (const value of profile.detections) {
    const detection = strictRecord(value, "SCAN_TECHNOLOGY_DETECTION_INVALID", ["ecosystem", "framework", "versionRange", "confidence", "evidenceRefs", "conflicts"]);
    nonEmptyString(detection.ecosystem, "SCAN_TECHNOLOGY_DETECTION_INVALID");
    nonEmptyString(detection.framework, "SCAN_TECHNOLOGY_DETECTION_INVALID");
    nonEmptyString(detection.versionRange, "SCAN_TECHNOLOGY_DETECTION_INVALID");
    if (typeof detection.confidence !== "number" || detection.confidence < 0 || detection.confidence > 1) throw new Error("SCAN_TECHNOLOGY_DETECTION_INVALID");
    stringArray(detection.evidenceRefs, "SCAN_TECHNOLOGY_DETECTION_INVALID");
    stringArray(detection.conflicts, "SCAN_TECHNOLOGY_DETECTION_INVALID");
  }
  stringArray(profile.conflicts, "SCAN_TECHNOLOGY_PROFILE_INVALID");
  sha256(profile.digest, "SCAN_TECHNOLOGY_PROFILE_INVALID");
}

function validateCoveragePlan(value: unknown): asserts value is AssetCoveragePlan {
  const plan = strictRecord(value, "SCAN_COVERAGE_PLAN_INVALID", ["assetFamilies", "capabilities", "complete", "digest"]);
  stringArray(plan.assetFamilies, "SCAN_COVERAGE_PLAN_INVALID");
  if (!Array.isArray(plan.capabilities)) throw new Error("SCAN_COVERAGE_PLAN_INVALID");
  for (const value of plan.capabilities) {
    const capability = strictRecord(value, "SCAN_CAPABILITY_INVALID", ["assetFamily", "framework", "state", "required", "reasonCodes", "extractorIds"]);
    nonEmptyString(capability.assetFamily, "SCAN_CAPABILITY_INVALID");
    nonEmptyString(capability.framework, "SCAN_CAPABILITY_INVALID");
    enumValue(capability.state, ["FULL", "PARTIAL", "DISCOVERY_ONLY", "SEMANTIC_REVIEW_REQUIRED", "UNSUPPORTED", "NOT_APPLICABLE"], "SCAN_CAPABILITY_INVALID");
    booleanValue(capability.required, "SCAN_CAPABILITY_INVALID");
    stringArray(capability.reasonCodes, "SCAN_CAPABILITY_INVALID");
    stringArray(capability.extractorIds, "SCAN_CAPABILITY_INVALID");
  }
  booleanValue(plan.complete, "SCAN_COVERAGE_PLAN_INVALID");
  sha256(plan.digest, "SCAN_COVERAGE_PLAN_INVALID");
}

export function canonicalJsonBytes(value: unknown): Uint8Array {
  return encoder.encode(canonicalJson(value));
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    if (typeof value === "string") assertUnicode(value);
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("CANONICAL_JSON_NON_FINITE_NUMBER");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!isRecord(value)) throw new Error("CANONICAL_JSON_VALUE_INVALID");
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${canonicalJson(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function validateObservation(value: unknown): asserts value is SourceObservationV2 {
  const observation = strictRecord(value, "SCAN_OBSERVATION_INVALID", [
    "id", "observationType", "architectureLayer", "aspectHint", "repository", "source", "parser", "payload", "sensitivity", "redaction", "evidenceRefs", "normalizedDigest", "warnings", "coverageGaps"
  ]);
  nonEmptyString(observation.id, "SCAN_OBSERVATION_INVALID");
  nonEmptyString(observation.observationType, "SCAN_OBSERVATION_INVALID");
  enumValue(observation.architectureLayer, ["BIZ", "SYS", "TECH", "UNKNOWN"], "SCAN_OBSERVATION_INVALID");
  nullableString(observation.aspectHint, "SCAN_OBSERVATION_INVALID");

  const repository = strictRecord(observation.repository, "SCAN_REPOSITORY_INVALID", ["repositoryId", "snapshotKind", "snapshotDigest", "commit"]);
  nonEmptyString(repository.repositoryId, "SCAN_REPOSITORY_INVALID");
  enumValue(repository.snapshotKind, ["COMMIT", "DIRTY_MANIFEST"], "SCAN_REPOSITORY_INVALID");
  sha256(repository.snapshotDigest, "SCAN_REPOSITORY_INVALID");
  nullableString(repository.commit, "SCAN_REPOSITORY_INVALID");

  const source = strictRecord(observation.source, "SCAN_SOURCE_INVALID", ["path", "symbol", "lineStart", "lineEnd"]);
  nonEmptyString(source.path, "SCAN_SOURCE_INVALID");
  nullableString(source.symbol, "SCAN_SOURCE_INVALID");
  nullablePositiveInteger(source.lineStart, "SCAN_SOURCE_INVALID");
  nullablePositiveInteger(source.lineEnd, "SCAN_SOURCE_INVALID");
  if (typeof source.lineStart === "number" && typeof source.lineEnd === "number" && source.lineEnd < source.lineStart) throw new Error("SCAN_SOURCE_RANGE_INVALID");

  const parser = strictRecord(observation.parser, "SCAN_PARSER_INVALID", ["id", "version"]);
  nonEmptyString(parser.id, "SCAN_PARSER_INVALID");
  nonEmptyString(parser.version, "SCAN_PARSER_INVALID");
  if (!isRecord(observation.payload)) throw new Error("SCAN_OBSERVATION_PAYLOAD_INVALID");
  canonicalJsonBytes(observation.payload);
  enumValue(observation.sensitivity, ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"], "SCAN_SENSITIVITY_INVALID");

  const redaction = strictRecord(observation.redaction, "SCAN_REDACTION_INVALID", ["status", "reasons"]);
  enumValue(redaction.status, ["NONE", "REDACTED", "BLOCKED"], "SCAN_REDACTION_INVALID");
  stringArray(redaction.reasons, "SCAN_REDACTION_INVALID");

  if (!Array.isArray(observation.evidenceRefs) || observation.evidenceRefs.length === 0) throw new Error("SCAN_EVIDENCE_REQUIRED");
  for (const evidenceValue of observation.evidenceRefs) {
    const evidence = strictRecord(evidenceValue, "SCAN_EVIDENCE_INVALID", ["id", "kind", "digest", "excerpt"], ["excerpt"]);
    nonEmptyString(evidence.id, "SCAN_EVIDENCE_INVALID");
    enumValue(evidence.kind, ["SOURCE_EXCERPT", "CONTENT_ADDRESS", "MANIFEST_ENTRY"], "SCAN_EVIDENCE_INVALID");
    sha256(evidence.digest, "SCAN_EVIDENCE_INVALID");
    if (evidence.excerpt !== undefined && encoder.encode(nonEmptyString(evidence.excerpt, "SCAN_EVIDENCE_INVALID")).byteLength > SCAN_LIMITS.maxExcerptBytes) {
      throw new Error("SCAN_EXCERPT_BYTE_LIMIT_EXCEEDED");
    }
  }
  sha256(observation.normalizedDigest, "SCAN_OBSERVATION_DIGEST_INVALID");
  stringArray(observation.warnings, "SCAN_OBSERVATION_INVALID");
  stringArray(observation.coverageGaps, "SCAN_OBSERVATION_INVALID");
}

function validateScope(value: unknown): ArchitectureScope {
  const scope = strictRecord(value, "SCOPE_REQUIRED", ["applicationServiceId", "scopePath"]);
  nonEmptyString(scope.applicationServiceId, "SCOPE_REQUIRED");
  nonEmptyString(scope.scopePath, "SCOPE_REQUIRED");
  return scope as unknown as ArchitectureScope;
}

function assertExpectedScope(
  actual: ArchitectureScope,
  sessionId: string,
  expected?: ArchitectureScope | Pick<ScanSessionDescriptor, "architectureScope" | "sessionId">
): void {
  if (!expected) return;
  const maybeSession = expected as Partial<ScanSessionDescriptor>;
  const expectedScope = maybeSession.architectureScope ?? expected as ArchitectureScope;
  if (maybeSession.sessionId !== undefined && maybeSession.sessionId !== sessionId) throw new Error("SCAN_SESSION_MISMATCH");
  if (actual.applicationServiceId !== expectedScope.applicationServiceId || actual.scopePath !== expectedScope.scopePath) throw new Error("SCOPE_MISMATCH");
}

function strictRecord(value: unknown, code: string, allowed: string[], optional: string[] = []): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(code);
  const allowedKeys = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) throw new Error(`${code}:ADDITIONAL_PROPERTY`);
  const optionalKeys = new Set(optional);
  if (allowed.some((key) => !optionalKeys.has(key) && !(key in value))) throw new Error(`${code}:REQUIRED_PROPERTY`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function contractVersion(value: unknown): void {
  if (value !== "2.0") throw new Error("SCAN_CONTRACT_VERSION_UNSUPPORTED");
}

function nonEmptyString(value: unknown, code: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(code);
  assertUnicode(value);
  return value;
}

function nullableString(value: unknown, code: string): void {
  if (value !== null) nonEmptyString(value, code);
}

function sha256(value: unknown, code: string): void {
  if (typeof value !== "string" || !sha256Pattern.test(value)) throw new Error(code);
}

function nullableSha256(value: unknown, code: string): void {
  if (value !== null) sha256(value, code);
}

function integer(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(code);
  return value;
}

function nonNegativeInteger(value: unknown, code: string): number {
  const result = integer(value, code);
  if (result < 0) throw new Error(code);
  return result;
}

function nullablePositiveInteger(value: unknown, code: string): void {
  if (value !== null && integer(value, code) < 1) throw new Error(code);
}

function booleanValue(value: unknown, code: string): void {
  if (typeof value !== "boolean") throw new Error(code);
}

function stringArray(value: unknown, code: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error(code);
  value.forEach(assertUnicode);
  return value as string[];
}

function enumValue(value: unknown, allowed: string[], code: string): void {
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error(code);
}

function dateTime(value: unknown, code: string): void {
  const text = nonEmptyString(value, code);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(text) || Number.isNaN(Date.parse(text))) throw new Error(code);
}

function assertUnicode(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("CANONICAL_JSON_INVALID_UNICODE");
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error("CANONICAL_JSON_INVALID_UNICODE");
    }
  }
}

function decodeBase64(value: string): Uint8Array {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function arrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}
