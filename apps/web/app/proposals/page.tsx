import Link from "next/link";
import { Badge, DataTable, PageHeader } from "../../components/ui";
import { getProposalsWithDatabase } from "../../lib/assets";
import { T } from "../../components/language-provider";
import { buildScopedHref } from "../../lib/scope";
import { getRequestLocale } from "../../lib/locale";

export default async function ProposalsPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope = "" } = await searchParams;
  const locale = await getRequestLocale();
  const proposals = await getProposalsWithDatabase(scope, locale);
  return (
    <>
      <PageHeader title={<T k="proposal.title" />} description={<T k="proposal.description" />} action={<span className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted">{locale === "zh" ? "提案由 MCP 管理" : "Proposals managed via MCP"}</span>} />
      <DataTable columns={[<T k="table.title" key="title" />, <T k="table.status" key="status" />, <T k="table.impactedAssets" key="impacted" />, <T k="table.details" key="details" />]} rows={proposals.map((proposal) => [
        proposal.title,
        <Badge key="status" tone="amber">{proposal.status}</Badge>,
        proposal.impactedAssets.length,
        <Link className="text-accent" href={buildScopedHref(`/proposals/${proposal.id}`, scope)} key="link"><T k="action.view" /></Link>
      ])} />
    </>
  );
}
