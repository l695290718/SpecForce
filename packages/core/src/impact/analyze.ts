import { getAsset, getDomainName } from "../repository";
import { runGovernanceChecks } from "../rules/governance";
import type { ImpactAnalysis, Proposal } from "../types";

export async function analyzeProposalImpact(proposalId: string): Promise<ImpactAnalysis> {
  const proposal = getAsset<Proposal>("proposal", proposalId);
  const governanceResults = (await Promise.all(proposal.impactedAssets.map((asset) => runGovernanceChecks(asset.type, asset.id)))).flat();
  const affectedDomains = Array.from(
    new Set(
      proposal.impactedAssets
        .map((asset) => {
          const record = getAsset(asset.type, asset.id) as { domainId?: string };
          return getDomainName(record.domainId);
        })
        .filter(Boolean)
    )
  );
  const riskLevel = proposal.risks.some((risk) => /高风险|high/i.test(risk)) ? "high" : proposal.impactedAssets.length > 5 ? "medium" : "low";
  const requiredContextPack = proposal.impactedAssets.some((asset) => asset.type === "api" || asset.type === "event");

  return {
    proposalId,
    impactedAssetCount: proposal.impactedAssets.length,
    impactedAssets: proposal.impactedAssets,
    affectedDomains,
    riskLevel,
    requiredContextPack,
    governanceWarnings: governanceResults.filter((result) => result.status === "fail"),
    implementationTasks: [
      "Update Prisma/schema migration for refund persistence.",
      "Implement RefundEligibilityService with refundable amount calculation.",
      "Expose CreateRefund API with auth, idempotency, and error-code handling.",
      "Publish RefundCreated and RefundSucceeded events with standard envelope fields.",
      "Wire payment refund integration with retry, fallback, and circuit-breaker policy.",
      "Add dashboards and alerts for refund success rate and retry spikes."
    ]
  };
}
