import { maximumReviewRisk, type KnowledgeAssertion, type ReviewRiskTier } from "@specforge/core";
import { assessReviewCandidates } from "./risk-policy";

export interface ReviewBundlePartition {
  key: string;
  riskTier: ReviewRiskTier;
  domainCluster: string;
  assertions: KnowledgeAssertion[];
  sourceObservationIds: string[];
  evidenceRefs: string[];
  blockingIssues: string[];
}

export function partitionReviewCandidates(assertions: readonly KnowledgeAssertion[]): ReviewBundlePartition[] {
  const groups = new Map<string, KnowledgeAssertion[]>();
  for (const assertion of assertions) {
    const riskTier = assertion.riskTier ?? "T1";
    const domainCluster = assertion.domainCluster?.trim() || "unclassified";
    const key = `${riskTier}:${domainCluster}`;
    const group = groups.get(key) ?? [];
    group.push(assertion);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, group]) => {
      const ordered = [...group].sort((left, right) => left.id.localeCompare(right.id));
      const assessment = assessReviewCandidates(ordered);
      return {
        key,
        riskTier: maximumReviewRisk(ordered.map((assertion) => assertion.riskTier ?? "T1")),
        domainCluster: ordered[0]?.domainCluster?.trim() || "unclassified",
        assertions: ordered,
        sourceObservationIds: sortedUnique(ordered.flatMap((assertion) => assertion.sourceObservationIds)),
        evidenceRefs: sortedUnique(ordered.flatMap((assertion) => assertion.evidenceRefs)),
        blockingIssues: assessment.blockingIssues
      };
    });
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
