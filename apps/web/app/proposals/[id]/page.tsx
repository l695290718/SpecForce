import { analyzeProposalImpact, type ImpactAnalysis } from "@specforge/core";
import { ProposalDetail } from "../../../components/proposal-detail";
import { getProposalWithDatabase } from "../../../lib/assets";

export default async function ProposalDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ scope?: string }> }) {
  const { id } = await params;
  const { scope = "" } = await searchParams;
  const proposal = await getProposalWithDatabase(id, scope);
  const impact = await getImpactForProposal(proposal);

  return <ProposalDetail impact={impact} proposal={proposal} />;
}

async function getImpactForProposal(proposal: Awaited<ReturnType<typeof getProposalWithDatabase>>) {
  try {
    return await analyzeProposalImpact(proposal.id);
  } catch {
    return {
      proposalId: proposal.id,
      impactedAssetCount: proposal.impactedAssets.length,
      impactedAssets: proposal.impactedAssets,
      affectedDomains: proposal.domainId ? [proposal.domainId] : [],
      riskLevel: proposal.risks.some((risk) => /high|high risk/i.test(risk)) ? "high" : proposal.impactedAssets.length > 5 ? "medium" : "low",
      requiredContextPack: true,
      governanceWarnings: [],
      implementationTasks: proposal.specChanges
    } satisfies ImpactAnalysis;
  }
}
