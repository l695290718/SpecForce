import { contentDigest } from "../federation/digest";
import type { ArchitectureScopeRef } from "../architecture/types";
import type { ArchitectureLayer } from "../knowledge/types";
import type {
  ArchitectureFactBatchSubmission,
  ArchitectureUnitMappingRevisionInput,
  ArchitectureUnitMembershipRevisionInput,
  ArchitectureUnitRevisionInput
} from "./types";

export type ThreeACandidateSetStatus =
  "GENERATING" | "READY" | "BLOCKED" | "STALE" | "APPROVED" | "REJECTED" | "PROMOTED";

export interface ThreeACandidateAnalysisRequest {
  architectureScope: ArchitectureScopeRef;
  sourceBaselineId: string;
  designChangeSessionId: string;
  intent: string;
  assetIds?: string[];
  idempotencyKey: string;
  evidenceRefs: string[];
  candidateBatch: Omit<
    ArchitectureFactBatchSubmission,
    "architectureScope" | "designChangeSessionId" | "idempotencyKey"
  > & {
    designChangeSessionId?: string;
    excludedCandidates?: ThreeACandidateExclusion[];
    blockingIssues?: string[];
  };
}

export interface ThreeACandidateSnapshot {
  sourceBaselineId: string;
  catalogDigest: string;
  relationshipVersion: string;
  designContextDigest: string;
  capturedAt: string;
}

export interface ThreeACandidateCounts {
  BIZ: number;
  SYS: number;
  TECH: number;
}

export interface ThreeACandidateExclusion {
  assetType: string;
  assetId: string;
  reasonCode: string;
  evidenceRefs: string[];
  retryTrigger: string;
}

export interface ThreeACandidateSet {
  id: string;
  architectureScope: ArchitectureScopeRef;
  status: ThreeACandidateSetStatus;
  sourceBaselineId: string;
  batchId: string;
  candidates: {
    units: ArchitectureUnitRevisionInput[];
    memberships: ArchitectureUnitMembershipRevisionInput[];
    mappings: ArchitectureUnitMappingRevisionInput[];
  };
  architectureFactRevisionIds: {
    unitRevisionIds: readonly string[];
    membershipRevisionIds: readonly string[];
    mappingRevisionIds: readonly string[];
  };
  snapshot: ThreeACandidateSnapshot;
  candidateCounts: ThreeACandidateCounts;
  excludedCandidates: ThreeACandidateExclusion[];
  blockingIssues: string[];
  evidenceRefs: string[];
  contentDigest: string;
  createdAt: string;
  updatedAt: string;
}

const transitions: Record<ThreeACandidateSetStatus, readonly ThreeACandidateSetStatus[]> = {
  GENERATING: ["READY", "BLOCKED"],
  READY: ["STALE", "APPROVED", "REJECTED"],
  BLOCKED: ["GENERATING"],
  STALE: ["GENERATING"],
  APPROVED: ["PROMOTED", "STALE"],
  REJECTED: [],
  PROMOTED: []
};

export function validateCandidateSetTransition(from: ThreeACandidateSetStatus, to: ThreeACandidateSetStatus): true {
  if (!transitions[from].includes(to)) throw new Error("CANDIDATE_SET_TRANSITION_INVALID");
  return true;
}

export function candidateSetIsStale(
  candidate: Pick<ThreeACandidateSet, "snapshot">,
  current: ThreeACandidateSnapshot
): boolean {
  return (
    candidate.snapshot.sourceBaselineId !== current.sourceBaselineId ||
    candidate.snapshot.catalogDigest !== current.catalogDigest ||
    candidate.snapshot.relationshipVersion !== current.relationshipVersion ||
    candidate.snapshot.designContextDigest !== current.designContextDigest
  );
}

export function candidateSetDigest(input: {
  architectureScope: ArchitectureScopeRef;
  sourceBaselineId: string;
  batchId: string;
  architectureFactRevisionIds: ThreeACandidateSet["architectureFactRevisionIds"];
  snapshot: ThreeACandidateSnapshot;
  candidateCounts: ThreeACandidateCounts;
  excludedCandidates: readonly ThreeACandidateExclusion[];
  blockingIssues: readonly string[];
  evidenceRefs: readonly string[];
}): string {
  return contentDigest({
    architectureScope: input.architectureScope,
    sourceBaselineId: input.sourceBaselineId,
    batchId: input.batchId,
    architectureFactRevisionIds: input.architectureFactRevisionIds,
    snapshot: input.snapshot,
    candidateCounts: input.candidateCounts,
    excludedCandidates: input.excludedCandidates,
    blockingIssues: input.blockingIssues,
    evidenceRefs: input.evidenceRefs
  });
}

export function candidateCounts(submission: Pick<ArchitectureFactBatchSubmission, "units">): ThreeACandidateCounts {
  return submission.units.reduce<ThreeACandidateCounts>(
    (counts, unit) => {
      counts[unit.layer as ArchitectureLayer] += 1;
      return counts;
    },
    { BIZ: 0, SYS: 0, TECH: 0 }
  );
}

export function validateCandidateAnalysisRequest(request: ThreeACandidateAnalysisRequest): void {
  if (!request.architectureScope.applicationServiceId?.trim() || !request.architectureScope.scopePath?.trim())
    throw new Error("THREE_A_CANDIDATE_SCOPE_REQUIRED");
  if (!request.sourceBaselineId?.trim()) throw new Error("THREE_A_CANDIDATE_SOURCE_BASELINE_REQUIRED");
  if (!request.designChangeSessionId?.trim()) throw new Error("THREE_A_CANDIDATE_DESIGN_SESSION_REQUIRED");
  if (!request.intent?.trim()) throw new Error("THREE_A_CANDIDATE_INTENT_REQUIRED");
  if (!request.idempotencyKey?.trim()) throw new Error("THREE_A_CANDIDATE_IDEMPOTENCY_KEY_REQUIRED");
  if (
    !Array.isArray(request.evidenceRefs) ||
    request.evidenceRefs.length === 0 ||
    request.evidenceRefs.some((ref) => !ref.trim())
  )
    throw new Error("THREE_A_CANDIDATE_EVIDENCE_REQUIRED");
  if (request.assetIds && (request.assetIds.length > 500 || request.assetIds.some((id) => !id.trim())))
    throw new Error("THREE_A_CANDIDATE_ASSET_SELECTION_INVALID");
  if (
    !request.candidateBatch ||
    !Array.isArray(request.candidateBatch.units) ||
    !Array.isArray(request.candidateBatch.memberships) ||
    !Array.isArray(request.candidateBatch.mappings)
  )
    throw new Error("THREE_A_CANDIDATE_BATCH_REQUIRED");
  validateCandidateClosure(request.candidateBatch);
}

function validateCandidateClosure(batch: ThreeACandidateAnalysisRequest["candidateBatch"]): void {
  if (batch.units.length === 0) throw new Error("THREE_A_CANDIDATE_UNITS_REQUIRED");
  const unitsById = new Map(batch.units.map((unit) => [unit.unitIdentity, unit]));
  const primaryAssets = new Map<string, string>();
  for (const member of batch.memberships) {
    const selector =
      member.assetType && member.assetId
        ? `${member.assetType}:${member.assetId}`
        : (member.assertionId ?? member.semanticIdentity);
    const existing = primaryAssets.get(selector);
    if (existing && existing !== member.unitIdentity) throw new Error("THREE_A_CANDIDATE_PRIMARY_MEMBERSHIP_CONFLICT");
    primaryAssets.set(selector, member.unitIdentity);
  }
  const bizToSys = new Set<string>();
  const sysToTech = new Set<string>();
  for (const mapping of batch.mappings) {
    const source = unitsById.get(mapping.sourceUnitIdentity);
    const target = unitsById.get(mapping.targetUnitIdentity);
    if (!source || !target) throw new Error("THREE_A_CANDIDATE_MAPPING_ENDPOINT_UNRESOLVED");
    if (source.layer === "BIZ" && target.layer === "SYS") bizToSys.add(target.unitIdentity);
    if (source.layer === "SYS" && target.layer === "TECH") sysToTech.add(target.unitIdentity);
  }
  if (batch.units.some((unit) => unit.layer === "SYS" && !bizToSys.has(unit.unitIdentity)))
    throw new Error("THREE_A_CANDIDATE_SYS_NOT_CLOSED");
  if (batch.units.some((unit) => unit.layer === "TECH" && !sysToTech.has(unit.unitIdentity)))
    throw new Error("THREE_A_CANDIDATE_TECH_NOT_CLOSED");
}
