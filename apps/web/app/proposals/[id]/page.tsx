import Link from "next/link";
import { Badge, ButtonLink, Card, DataTable, PageHeader } from "../../../components/ui";
import { analyzeProposalImpact, getAsset, type Proposal } from "@specforge/core";
import { T } from "../../../components/language-provider";

export default async function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposal = getAsset<Proposal>("proposal", id);
  const impact = await analyzeProposalImpact(id);

  return (
    <>
      <PageHeader title={proposal.title} description={proposal.description} action={<ButtonLink href={`/context-packs/ctx-${proposal.id.replace(/^proposal-/, "")}`}><T k="action.generateContextPack" /></ButtonLink>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card><Metric label="Status" value={proposal.status} tone="amber" /></Card>
        <Card><Metric label="Risk" value={impact.riskLevel} tone="red" /></Card>
        <Card><Metric label="Impacted Assets" value={String(impact.impactedAssetCount)} tone="blue" /></Card>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-base font-semibold"><T k="proposal.scope" /></h2>
          <DataTable columns={[<T k="table.item" key="item" />, <T k="table.content" key="content" />]} rows={[
            ["Background", proposal.background],
            ["Goal", proposal.goal],
            ["Non-goal", proposal.nonGoal],
            ["Scope", proposal.scope],
            ["Rollback", proposal.rollbackPlan ?? "未声明"]
          ]} />
        </Card>
        <Card>
          <h2 className="mb-3 text-base font-semibold"><T k="proposal.impactAnalysis" /></h2>
          <DataTable columns={[<T k="table.asset" key="asset" />, <T k="table.type" key="type" />]} rows={proposal.impactedAssets.map((asset) => [
            <Link className="text-accent" href={assetHref(asset.type, asset.id)} key={asset.id}>{asset.label}</Link>,
            <Badge key="type" tone="blue">{asset.type}</Badge>
          ])} />
        </Card>
      </div>
      <Card className="mt-6">
        <h2 className="mb-3 text-base font-semibold"><T k="proposal.implementationTasks" /></h2>
        <ul className="list-disc space-y-2 pl-5 text-sm">{impact.implementationTasks.map((task) => <li key={task}>{task}</li>)}</ul>
      </Card>
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "amber" | "red" | "blue" }) {
  return <div><div className="text-sm text-muted">{label}</div><div className="mt-2"><Badge tone={tone}>{value}</Badge></div></div>;
}

function assetHref(type: string, id: string): string {
  const routes: Record<string, string> = { domain: "domains", dataModel: "data-models", api: "apis", event: "events", businessRule: "rules", stateMachine: "state-machines", integration: "integrations", quality: "quality", observability: "observability", adr: "adrs" };
  return `/assets/${routes[type] ?? "domains"}/${id}`;
}
