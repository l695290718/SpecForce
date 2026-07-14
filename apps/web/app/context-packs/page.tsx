import Link from "next/link";
import { DataTable, PageHeader } from "../../components/ui";
import { T } from "../../components/language-provider";
import { getContextPacksWithDatabase } from "../../lib/assets";
import { buildScopedHref } from "../../lib/scope";
import { getRequestLocale } from "../../lib/locale";

export default async function ContextPacksPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope = "" } = await searchParams;
  const locale = await getRequestLocale();
  const packs = await getContextPacksWithDatabase(scope, locale);
  return (
    <>
      <PageHeader title={<T k="contextPacks.title" />} description={<T k="contextPacks.description" />} />
      <DataTable columns={[<T k="table.name" key="name" />, <T k="table.proposal" key="proposal" />, <T k="table.targetAgent" key="agent" />, <T k="table.details" key="details" />]} rows={packs.map((pack) => [
        pack.name,
        pack.proposalId,
        pack.targetAgent,
        <Link className="text-accent" href={buildScopedHref(`/context-packs/${pack.id}`, scope)} key={pack.id}><T k="action.view" /></Link>
      ])} />
    </>
  );
}
