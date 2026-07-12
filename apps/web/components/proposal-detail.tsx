"use client";

import Link from "next/link";
import { localizeProposal, type ImpactAnalysis, type Proposal } from "@specforge/core";
import { useLanguage } from "./language-provider";
import { Badge, ButtonLink, Card, DataTable, PageHeader } from "./ui";

interface ProposalDetailProps {
  proposal: Proposal;
  impact: ImpactAnalysis;
}

const labels = {
  zh: {
    status: "状态",
    risk: "风险",
    impactedAssets: "影响资产",
    scope: "范围说明",
    background: "背景",
    goal: "目标",
    nonGoal: "非目标",
    rollback: "回滚",
    notSpecified: "未指定",
    impactAnalysis: "影响分析",
    implementationTasks: "实现任务",
    item: "项目",
    content: "内容",
    asset: "资产",
    type: "类型"
  },
  en: {
    status: "Status",
    risk: "Risk",
    impactedAssets: "Impacted Assets",
    scope: "Scope",
    background: "Background",
    goal: "Goal",
    nonGoal: "Non-goal",
    rollback: "Rollback",
    notSpecified: "Not specified",
    impactAnalysis: "Impact Analysis",
    implementationTasks: "Implementation Tasks",
    item: "Item",
    content: "Content",
    asset: "Asset",
    type: "Type"
  }
} as const;

export function ProposalDetail({ proposal, impact }: ProposalDetailProps) {
  const { locale, t } = useLanguage();
  const copy = labels[locale];
  const localized = localizeProposal(proposal, locale);

  return (
    <>
      <PageHeader
        action={<ButtonLink href={`/context-packs/ctx-${proposal.id.replace(/^proposal-/, "")}`}>{t("action.generateContextPack")}</ButtonLink>}
        description={localized.description}
        title={localized.title}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card><Metric label={copy.status} value={proposal.status} tone="amber" /></Card>
        <Card><Metric label={copy.risk} value={impact.riskLevel} tone="red" /></Card>
        <Card><Metric label={copy.impactedAssets} value={String(impact.impactedAssetCount)} tone="blue" /></Card>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-base font-semibold">{copy.scope}</h2>
          <DataTable columns={[copy.item, copy.content]} rows={[
            [copy.background, <MultilineText key="background" value={localized.background} />],
            [copy.goal, <MultilineText key="goal" value={localized.goal} />],
            [copy.nonGoal, <MultilineText key="nonGoal" value={localized.nonGoal} />],
            [copy.scope, <MultilineText key="scope" value={localized.scope} />],
            [copy.rollback, <MultilineText key="rollback" value={localized.rollbackPlan ?? copy.notSpecified} />]
          ]} />
        </Card>
        <Card>
          <h2 className="mb-3 text-base font-semibold">{copy.impactAnalysis}</h2>
          <DataTable columns={[copy.asset, copy.type]} rows={proposal.impactedAssets.map((asset) => [
            <Link className="text-accent" href={assetHref(asset.type, asset.id)} key={asset.id}>{asset.label}</Link>,
            <Badge key="type" tone="blue">{asset.type}</Badge>
          ])} />
        </Card>
      </div>
      <Card className="mt-6">
        <h2 className="mb-3 text-base font-semibold">{copy.implementationTasks}</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm">{localized.specChanges.map((task) => <li key={task}>{task}</li>)}</ul>
      </Card>
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "amber" | "red" | "blue" }) {
  return <div><div className="text-sm text-muted">{label}</div><div className="mt-2"><Badge tone={tone}>{value}</Badge></div></div>;
}

function MultilineText({ value }: { value: string }) {
  return <div className="whitespace-pre-line leading-6">{value}</div>;
}

function assetHref(type: string, id: string): string {
  const routes: Record<string, string> = { domain: "domains", dataModel: "data-models", api: "apis", event: "events", businessRule: "rules", stateMachine: "state-machines", integration: "integrations", quality: "quality", observability: "observability", adr: "adrs" };
  return `/assets/${routes[type] ?? "domains"}/${id}`;
}
