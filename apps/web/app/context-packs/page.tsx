import Link from "next/link";
import { DataTable, PageHeader } from "../../components/ui";
import { getStore } from "@specforge/core";
import { T } from "../../components/language-provider";

export default function ContextPacksPage() {
  return (
    <>
      <PageHeader title={<T k="contextPacks.title" />} description={<T k="contextPacks.description" />} />
      <DataTable columns={[<T k="table.name" key="name" />, <T k="table.proposal" key="proposal" />, <T k="table.targetAgent" key="agent" />, <T k="table.details" key="details" />]} rows={getStore().contextPacks.map((pack) => [
        pack.name,
        pack.proposalId,
        pack.targetAgent,
        <Link className="text-accent" href={`/context-packs/${pack.id}`} key={pack.id}><T k="action.view" /></Link>
      ])} />
    </>
  );
}
