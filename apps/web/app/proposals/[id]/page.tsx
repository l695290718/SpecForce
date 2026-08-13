import { ProposalDetail } from "../../../components/proposal-detail";
import { getProposalWithDatabase, getScopedProposalImpact } from "../../../lib/assets";
import { getRequestLocale } from "../../../lib/locale";
import { getRequestPrincipal } from "../../../lib/request-principal";

export default async function ProposalDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ scope?: string }> }) {
  const { id } = await params;
  const { scope = "" } = await searchParams;
  const locale = await getRequestLocale();
  const principal = await getRequestPrincipal();
  const proposal = await getProposalWithDatabase(id, scope, locale, principal);
  const impact = await getScopedProposalImpact(proposal.id, scope, locale, principal);

  return <ProposalDetail impact={impact} proposal={proposal} scope={scope} />;
}
