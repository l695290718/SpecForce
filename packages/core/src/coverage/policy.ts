import { contentDigest } from "../federation/digest";
import type { ArchitectureScopeRef } from "../architecture/types";
import {
  COVERAGE_POLICY_ID,
  COVERAGE_POLICY_VERSION,
  COVERAGE_SCHEMA_VERSION,
  type CoverageBuildKeyInput,
  type CoverageCandidate,
  type CoverageExemption,
  type CoverageInputDigest,
  type CoveragePathEdge,
  type CoveragePathEvidence,
  type CoveragePathRule,
  type CoveragePolicy,
  type CoverageReasonCode,
  type CoverageResult
} from "./types";

const membershipAssetTypes = [
  "domain",
  "dataModel",
  "api",
  "event",
  "businessRule",
  "stateMachine",
  "integration",
  "observability"
] as const;

const pathRules: readonly CoveragePathRule[] = [
  rule("quality-verifies-member", "quality", [{ relationCode: "VERIFIES", sourceType: "quality", targetType: membershipAssetTypes }], 10),
  rule("adr-decides-member", "adr", [{ relationCode: "DECIDES", sourceType: "adr", targetType: membershipAssetTypes }], 20),
  rule("evidence-validates-adr-decides-member", "evidence", [
    { relationCode: "VALIDATES", sourceType: "evidence", targetType: "adr" },
    { relationCode: "DECIDES", sourceType: "adr", targetType: membershipAssetTypes }
  ], 30),
  rule("proposal-impacts-member", "proposal", [{ relationCode: "IMPACTS", sourceType: "proposal", targetType: membershipAssetTypes }], 40),
  rule("proposal-implements-decision", "proposal", [
    { relationCode: "IMPLEMENTS_DECISION", sourceType: "proposal", targetType: "adr" },
    { relationCode: "DECIDES", sourceType: "adr", targetType: membershipAssetTypes }
  ], 50),
  rule("context-pack-implements-proposal-impact", "contextPack", [
    { relationCode: "IMPLEMENTS_CONTEXT_FOR", sourceType: "contextPack", targetType: "proposal" },
    { relationCode: "IMPACTS", sourceType: "proposal", targetType: membershipAssetTypes }
  ], 60),
  rule("context-pack-implements-proposal-decision", "contextPack", [
    { relationCode: "IMPLEMENTS_CONTEXT_FOR", sourceType: "contextPack", targetType: "proposal" },
    { relationCode: "IMPLEMENTS_DECISION", sourceType: "proposal", targetType: "adr" },
    { relationCode: "DECIDES", sourceType: "adr", targetType: membershipAssetTypes }
  ], 70)
];

export const genericSystemCoverageProfile: CoveragePolicy = Object.freeze({
  id: COVERAGE_POLICY_ID,
  version: COVERAGE_POLICY_VERSION,
  schemaVersion: COVERAGE_SCHEMA_VERSION,
  maxPathLength: 3,
  membershipAssetTypes: Object.freeze([...membershipAssetTypes]),
  traceabilityAssetTypes: Object.freeze(["quality", "adr", "evidence", "proposal", "contextPack"]),
  requiresLocalization: false,
  requiresSnapshot: true,
  pathRules: Object.freeze(pathRules)
});

export function evaluateCoverageCandidate(input: CoverageCandidate, policy: CoveragePolicy): CoverageResult {
  const base = {
    exactScope: input.exactScope,
    ...(input.generationId ? { generationId: input.generationId } : {}),
    source: input.source,
    ...(input.sourceDigest ? { sourceDigest: input.sourceDigest } : {})
  };

  const scopeError = validateScope(input.exactScope);
  if (scopeError) return result(base, "TRACEABILITY", "BLOCKED", scopeError, undefined, undefined);
  if (policy.requiresSnapshot && input.snapshotAvailable === false) return result(base, "TRACEABILITY", "NOT_EVALUATED", "SNAPSHOT_UNAVAILABLE", undefined, undefined);
  if (policy.requiresLocalization && !hasRequiredLocalization(input.localization)) return result(base, "TRACEABILITY", "BLOCKED", "MISSING_LOCALIZATION", undefined, undefined);

  if (input.exemption) return evaluateExemption(base, input.exemption, policy);

  const isMembershipType = policy.membershipAssetTypes.includes(input.source.assetType);
  const directMemberships = input.directMemberships?.filter((candidate) => candidate.assetId === input.source.assetId && (candidate.assetType === input.source.assetType || candidate.historical === true)) ?? [];
  const directIds = [...new Set(input.directMemberIds)];
  const isHistoricalMembership = input.historicalDirectMemberIds?.includes(input.source.assetId) ?? false;
  if ((isMembershipType || isHistoricalMembership) && (directMemberships.length > 0 || directIds.includes(input.source.assetId))) {
    if (directMemberships.length > 1 || (directMemberships.length === 0 && directIds.length > 1)) {
      return result(base, "MEMBERSHIP", "BLOCKED", "AMBIGUOUS_MEMBERSHIP", undefined, undefined);
    }
    return result(base, "MEMBERSHIP", "COVERED", undefined, input.source.assetId, undefined);
  }

  if (!policy.traceabilityAssetTypes.includes(input.source.assetType)) {
    return result(base, "MEMBERSHIP", "BLOCKED", "UNSUPPORTED_PATH", undefined, undefined);
  }

  const paths = input.paths ?? (input.path ? [input.path] : []);
  if (paths.length === 0) return result(base, "TRACEABILITY", "BLOCKED", "MISSING_TYPED_PATH", undefined, undefined);

  const selected = selectCoveragePath(paths, policy, input);
  if (selected) {
    const terminalMemberId = selected[selected.length - 1]?.targetId;
    return result(base, "TRACEABILITY", "COVERED", undefined, terminalMemberId, selected);
  }

  const reason = diagnoseRejectedPaths(input, paths, policy);
  return result(base, "TRACEABILITY", "BLOCKED", reason, undefined, undefined);
}

export function selectCoveragePath(
  paths: CoveragePathEvidence[],
  policy: CoveragePolicy,
  context?: Pick<CoverageCandidate, "exactScope" | "source" | "knownAssetIds" | "knownRelationshipIdentities" | "directMemberIds">
): CoveragePathEvidence | undefined {
  const valid = paths
    .map((path) => ({ path, rule: matchingRule(path, policy), valid: validatePath(path, policy, context) }))
    .filter((candidate): candidate is { path: CoveragePathEvidence; rule: CoveragePathRule; valid: true } => Boolean(candidate.rule && candidate.valid));
  valid.sort((left, right) => {
    const length = left.path.length - right.path.length;
    if (length !== 0) return length;
    const precedence = left.rule.precedence - right.rule.precedence;
    if (precedence !== 0) return precedence;
    const terminal = (left.path[left.path.length - 1]?.targetId ?? "").localeCompare(right.path[right.path.length - 1]?.targetId ?? "");
    if (terminal !== 0) return terminal;
    return pathIdentity(left.path).localeCompare(pathIdentity(right.path));
  });
  return valid[0]?.path;
}

export function coverageInputDigest(input: CoverageInputDigest): string {
  return contentDigest(stripVolatileFields(input));
}

export function coverageBuildKey(input: CoverageBuildKeyInput): string {
  return coverageInputDigest({
    architectureScope: input.architectureScope,
    baselineId: input.baselineId,
    generationId: input.generationId,
    profileId: input.profileId,
    profileVersion: input.profileVersion,
    coverageSchemaVersion: input.coverageSchemaVersion,
    catalogVersion: input.catalogVersion,
    catalogDigest: input.catalogDigest,
    relationshipVersion: input.relationshipVersion,
    relationshipDigest: input.relationshipDigest,
    query: input.query
  });
}

function rule(id: string, sourceType: string, steps: CoveragePathRule["steps"], precedence: number): CoveragePathRule {
  return Object.freeze({ id, sourceType, steps: Object.freeze(steps.map((step) => Object.freeze(step))), precedence });
}

function matchingRule(path: CoveragePathEvidence, policy: CoveragePolicy): CoveragePathRule | undefined {
  return policy.pathRules.find((candidate) => candidate.sourceType === path[0]?.sourceType && candidate.steps.length === path.length && candidate.steps.every((step, index) => {
    const edge = path[index];
    return edge?.relationCode === step.relationCode && edge.sourceType === step.sourceType && matchesType(edge.targetType, step.targetType);
  }));
}

function validatePath(
  path: CoveragePathEvidence,
  policy: CoveragePolicy,
  context?: Pick<CoverageCandidate, "exactScope" | "source" | "knownAssetIds" | "knownRelationshipIdentities" | "directMemberIds">
): boolean {
  if (path.length === 0 || path.length > policy.maxPathLength) return false;
  if (context && (path[0]?.sourceType !== context.source.assetType || path[0]?.sourceId !== context.source.assetId)) return false;
  for (let index = 0; index < path.length; index += 1) {
    const edge = path[index]!;
    if (!edge.relationshipIdentity || !edge.sourceType || !edge.sourceId || !edge.targetType || !edge.targetId) return false;
    if (index > 0) {
      const previous = path[index - 1]!;
      if (previous.targetType !== edge.sourceType || previous.targetId !== edge.sourceId) return false;
    }
    if (edge.architectureScope && !sameScope(edge.architectureScope, context?.exactScope)) return false;
    if (edge.scope && !sameScope(edge.scope, context?.exactScope)) return false;
    if (edge.sourceScope && !sameScope(edge.sourceScope, context?.exactScope)) return false;
    if (edge.targetScope && !sameScope(edge.targetScope, context?.exactScope)) return false;
    if (edge.sourceExists === false || edge.targetExists === false) return false;
    if (context?.knownRelationshipIdentities && !context.knownRelationshipIdentities.includes(edge.relationshipIdentity)) return false;
    if (context?.knownAssetIds && (!context.knownAssetIds.includes(edge.sourceId) || !context.knownAssetIds.includes(edge.targetId))) return false;
  }
  const terminalMemberId = path[path.length - 1]?.targetId;
  if (terminalMemberId && context?.directMemberIds && !context.directMemberIds.includes(terminalMemberId)) return false;
  return true;
}

function diagnoseRejectedPaths(input: CoverageCandidate, paths: CoveragePathEvidence[], policy: CoveragePolicy): CoverageReasonCode {
  if (paths.some((path) => path.some((edge) => edge.architectureScope && !sameScope(edge.architectureScope, input.exactScope) || edge.scope && !sameScope(edge.scope, input.exactScope) || edge.sourceScope && !sameScope(edge.sourceScope, input.exactScope) || edge.targetScope && !sameScope(edge.targetScope, input.exactScope)))) return "ENDPOINT_SCOPE_MISMATCH";
  if (paths.some((path) => path.some((edge) => edge.sourceExists === false || edge.targetExists === false))) return "ENDPOINT_NOT_FOUND";
  if (paths.some((path) => path.some((edge) => input.knownRelationshipIdentities && !input.knownRelationshipIdentities.includes(edge.relationshipIdentity) || input.knownAssetIds && (!input.knownAssetIds.includes(edge.sourceId) || !input.knownAssetIds.includes(edge.targetId))))) return "ENDPOINT_NOT_FOUND";
  if (paths.some((path) => !isContinuous(path))) return "RELATION_DIRECTION_INVALID";
  if (paths.some((path) => path.length > policy.maxPathLength)) return "UNSUPPORTED_PATH";
  if (paths.some((path) => path.length > 0 && path[0]?.sourceType === input.source.assetType && !matchingRule(path, policy))) return "UNSUPPORTED_PATH";
  return "RELATION_DIRECTION_INVALID";
}

function evaluateExemption(base: Omit<CoverageResult, "role" | "status" | "rowDigest">, exemption: CoverageExemption, policy: CoveragePolicy): CoverageResult {
  if (!exemption.reason.trim() || !exemption.owner.trim() || exemption.evidenceRefs.length === 0 || exemption.policyVersion !== policy.version) {
    return result(base, "EXEMPTION", "BLOCKED", "UNSUPPORTED_PATH", undefined, undefined);
  }
  return result(base, "EXEMPTION", "COVERED", undefined, undefined, undefined, exemption.reason);
}

function result(
  base: Omit<CoverageResult, "role" | "status" | "rowDigest">,
  role: CoverageResult["role"],
  status: CoverageResult["status"],
  reasonCode: CoverageReasonCode | undefined,
  terminalMemberId: string | undefined,
  path: CoveragePathEvidence | undefined,
  diagnosticRef?: string
): CoverageResult {
  const value: CoverageResult = {
    ...base,
    role,
    status,
    ...(terminalMemberId ? { terminalMemberId } : {}),
    ...(path ? { path } : {}),
    ...(reasonCode ? { reasonCode } : {}),
    ...(diagnosticRef ? { diagnosticRef } : reasonCode ? { diagnosticRef: `coverage-diagnostic:${contentDigest({ exactScope: base.exactScope, source: base.source, reasonCode, path })}` } : {}),
    rowDigest: ""
  };
  value.rowDigest = contentDigest({ ...value, rowDigest: undefined });
  return value;
}

function hasRequiredLocalization(localization: CoverageCandidate["localization"]): boolean {
  return Boolean(localization?.en && localization?.zh);
}

function validateScope(scope: ArchitectureScopeRef | undefined): CoverageReasonCode | undefined {
  return scope?.applicationServiceId?.trim() && scope.scopePath?.trim() ? undefined : "ENDPOINT_SCOPE_MISMATCH";
}

function sameScope(left: ArchitectureScopeRef | undefined, right: ArchitectureScopeRef | undefined): boolean {
  return Boolean(left && right && left.applicationServiceId === right.applicationServiceId && left.scopePath === right.scopePath);
}

function matchesType(actual: string, expected: string | readonly string[]): boolean {
  return Array.isArray(expected) ? expected.includes(actual) : actual === expected;
}

function isContinuous(path: CoveragePathEvidence): boolean {
  return path.every((edge, index) => index === 0 || path[index - 1]!.targetType === edge.sourceType && path[index - 1]!.targetId === edge.sourceId);
}

function pathIdentity(path: CoveragePathEvidence): string {
  return path.map((edge: CoveragePathEdge) => `${edge.relationshipIdentity}:${edge.sourceType}:${edge.sourceId}->${edge.targetType}:${edge.targetId}`).join("|");
}

function stripVolatileFields(input: CoverageInputDigest): unknown {
  return Object.fromEntries(Object.entries(input).filter(([key]) => key !== "attempt" && !/At$/u.test(key)).map(([key, value]) => [key, key === "sourceRevisionIds" && Array.isArray(value) ? [...value].sort() : value]));
}
