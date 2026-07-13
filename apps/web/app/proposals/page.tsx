import Link from "next/link";
import { Badge, ButtonLink, DataTable, PageHeader } from "../../components/ui";
import { getProposalsWithDatabase } from "../../lib/assets";
import { T } from "../../components/language-provider";
import { buildScopedHref } from "../../lib/scope";

export default async function ProposalsPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope = "" } = await searchParams;
  const proposals = await getProposalsWithDatabase(scope);
  return (
    <>
      <PageHeader title={<T k="proposal.title" />} description={<T k="proposal.description" />} action={<ButtonLink href={buildScopedHref("/proposals/new", scope)}><T k="proposal.new" /></ButtonLink>} />
      <DataTable columns={[<T k="table.title" key="title" />, <T k="table.status" key="status" />, <T k="table.impactedAssets" key="impacted" />, <T k="table.details" key="details" />]} rows={proposals.map((proposal) => [
        proposal.title,
        <Badge key="status" tone="amber">{proposal.status}</Badge>,
        proposal.impactedAssets.length,
        <Link className="text-accent" href={buildScopedHref(`/proposals/${proposal.id}`, scope)} key="link"><T k="action.view" /></Link>
      ])} />
    </>
  );
}
