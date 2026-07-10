import Link from "next/link";
import { Badge, ButtonLink, DataTable, PageHeader } from "../../components/ui";
import { getStore } from "@specforge/core";
import { T } from "../../components/language-provider";

export default function ProposalsPage() {
  const proposals = getStore().proposals;
  return (
    <>
      <PageHeader title={<T k="proposal.title" />} description={<T k="proposal.description" />} action={<ButtonLink href="/proposals/new"><T k="proposal.new" /></ButtonLink>} />
      <DataTable columns={[<T k="table.title" key="title" />, <T k="table.status" key="status" />, <T k="table.impactedAssets" key="impacted" />, <T k="table.details" key="details" />]} rows={proposals.map((proposal) => [
        proposal.title,
        <Badge key="status" tone="amber">{proposal.status}</Badge>,
        proposal.impactedAssets.length,
        <Link className="text-accent" href={`/proposals/${proposal.id}`} key="link"><T k="action.view" /></Link>
      ])} />
    </>
  );
}
