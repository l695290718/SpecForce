import type {
  KnowledgeDimension,
  KnowledgeEvidenceSnapshot,
  KnowledgeReadinessDecision,
  KnowledgeReadinessPolicy,
  KnowledgeReasonCode,
  KnowledgeRemediationAction,
  KnowledgeSourceRequirement,
  KnowledgeTrustStatus,
  KnowledgeProfileId
} from "./types";

const statusRank: Record<KnowledgeTrustStatus, number> = {
  SELF_CONTAINED: 0,
  SOURCE_CHECK_REQUIRED: 1,
  BLOCKED: 2
};

const dimensionOrder: KnowledgeDimension[] = ["DESIGN_INTENT", "IMPLEMENTATION", "RUNTIME"];

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort() as T[];
}

function actionsFor(reasons: readonly KnowledgeReasonCode[]): KnowledgeRemediationAction[] {
  const actions = new Set<KnowledgeRemediationAction>();
  if (reasons.includes("KNOWLEDGE_SOURCE_NOT_CONFIGURED") || reasons.includes("KNOWLEDGE_STALE")) actions.add("RESUME_CONNECTOR");
  if (reasons.includes("KNOWLEDGE_FULL_SNAPSHOT_REQUIRED") || reasons.includes("KNOWLEDGE_COVERAGE_INCOMPLETE")) actions.add("START_FULL_SCAN");
  if (reasons.includes("KNOWLEDGE_PENDING_PROMOTION")) actions.add("REVIEW_CANDIDATES");
  if (reasons.includes("KNOWLEDGE_CONFLICT_UNRESOLVED")) actions.add("RESOLVE_CONFLICT");
  if (reasons.includes("KNOWLEDGE_RECONCILIATION_BLOCKED")) actions.add("RUN_RECONCILIATION");
  return [...actions].sort();
}

function sourceReasons(
  source: KnowledgeEvidenceSnapshot["sources"][number] | undefined,
  requirement: KnowledgeSourceRequirement,
  now: Date
): KnowledgeReasonCode[] {
  if (!source) return ["KNOWLEDGE_SOURCE_NOT_CONFIGURED"];
  const futureSeconds = (source.observedAt.getTime() - now.getTime()) / 1000;
  const receiveLagSeconds = (source.observedAt.getTime() - source.receivedAt.getTime()) / 1000;
  const ageSeconds = (now.getTime() - source.observedAt.getTime()) / 1000;
  const reasons: KnowledgeReasonCode[] = [];
  if (futureSeconds > requirement.maximumClockSkewSeconds || receiveLagSeconds > requirement.maximumClockSkewSeconds || ageSeconds > requirement.maximumFreshnessSeconds) reasons.push("KNOWLEDGE_STALE");
  if (requirement.requireFullSnapshot && !source.fullSnapshotCompleted) reasons.push("KNOWLEDGE_FULL_SNAPSHOT_REQUIRED");
  if (source.pendingCount > 0 || source.openTombstoneCount > 0) reasons.push("KNOWLEDGE_COVERAGE_INCOMPLETE");
  return reasons;
}

export function evaluateKnowledgeReadiness(input: {
  profileId: KnowledgeProfileId;
  policy: KnowledgeReadinessPolicy;
  snapshot: KnowledgeEvidenceSnapshot;
  now: Date;
}): KnowledgeReadinessDecision {
  const requirements = input.policy.profileRequirements[input.profileId];
  const profileGuard = input.policy.profileGuards[input.profileId];
  const dimensionReasons = new Map<KnowledgeDimension, KnowledgeReasonCode[]>(dimensionOrder.map((dimension) => [dimension, []]));
  const validUntilCandidates = [input.now.getTime() + input.policy.receiptTtlSeconds * 1000];

  if (profileGuard.requirePublishedBaseline && !input.snapshot.baseline) dimensionReasons.get("DESIGN_INTENT")!.push("KNOWLEDGE_SOURCE_NOT_CONFIGURED");
  if (input.snapshot.reconciliation?.status === "BLOCKED") dimensionReasons.get("DESIGN_INTENT")!.push("KNOWLEDGE_RECONCILIATION_BLOCKED");
  else if (profileGuard.reconciliation === "CONVERGED") {
    if (input.snapshot.reconciliation === null) dimensionReasons.get("DESIGN_INTENT")!.push("KNOWLEDGE_COVERAGE_INCOMPLETE");
    else if (input.snapshot.reconciliation.status !== "CONVERGED" && input.policy.blockOnNonConvergedReconciliation) dimensionReasons.get("DESIGN_INTENT")!.push("KNOWLEDGE_RECONCILIATION_BLOCKED");
  }
  if (input.snapshot.unresolvedConflictCount > 0 && input.policy.blockOnUnresolvedConflict) dimensionReasons.get("IMPLEMENTATION")!.push("KNOWLEDGE_CONFLICT_UNRESOLVED");
  if (input.snapshot.pendingCandidateCount > 0) dimensionReasons.get("IMPLEMENTATION")!.push("KNOWLEDGE_PENDING_PROMOTION");

  for (const requirement of requirements) {
    const source = input.snapshot.sources.find((candidate) => candidate.role === requirement.role);
    const reasons = sourceReasons(source, requirement, input.now);
    const dimension = dimensionReasons.get(requirement.dimension)!;
    dimension.push(...reasons);
    if (source) validUntilCandidates.push(source.observedAt.getTime() + requirement.maximumFreshnessSeconds * 1000);
  }

  const dimensionStatuses = dimensionOrder
    .filter((dimension) => requirements.some((requirement) => requirement.dimension === dimension) || (dimension === "DESIGN_INTENT" && ((profileGuard.requirePublishedBaseline && !input.snapshot.baseline) || (profileGuard.reconciliation === "CONVERGED" && input.snapshot.reconciliation === null) || input.snapshot.reconciliation?.status === "BLOCKED")))
    .map((dimension) => {
      const reasons = uniqueSorted(dimensionReasons.get(dimension)!);
      const status: KnowledgeTrustStatus = reasons.includes("KNOWLEDGE_CONFLICT_UNRESOLVED") || reasons.includes("KNOWLEDGE_RECONCILIATION_BLOCKED") ? "BLOCKED" : reasons.length ? "SOURCE_CHECK_REQUIRED" : "SELF_CONTAINED";
      return { dimension, status, reasonCodes: reasons };
    });
  const reasonCodes = uniqueSorted(dimensionStatuses.flatMap((status) => status.reasonCodes));
  const trustStatus = dimensionStatuses.reduce<KnowledgeTrustStatus>((current, item) => statusRank[item.status] > statusRank[current] ? item.status : current, "SELF_CONTAINED");
  return {
    trustStatus,
    dimensionStatuses,
    reasonCodes,
    remediationActions: actionsFor(reasonCodes),
    validUntil: new Date(Math.min(...validUntilCandidates))
  };
}
