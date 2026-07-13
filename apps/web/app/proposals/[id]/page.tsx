import { ProposalDetail } from "../../../components/proposal-detail";
import { getProposalWithDatabase, getScopedProposalImpact } from "../../../lib/assets";
import { getRequestLocale } from "../../../lib/locale";

export default async function ProposalDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ scope?: string }> }) {
  const { id } = await params;
  const { scope = "" } = await searchParams;
  const locale = await getRequestLocale();
  const proposal = await getProposalWithDatabase(id, scope, locale);
  const impact = await getScopedProposalImpact(proposal.id, scope, locale);

  return <ProposalDetail impact={impact} proposal={proposal} scope={scope} />;
}
