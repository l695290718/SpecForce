"use client";

import Link from "next/link";
import { type ImpactAnalysis, type Proposal } from "@specforge/core";
import { useLanguage } from "./language-provider";
import { Badge, ButtonLink, Card, DataTable, PageHeader } from "./ui";
import { buildScopedHref } from "../lib/scope";

interface ProposalDetailProps {
  proposal: Proposal;
  impact: ImpactAnalysis;
  scope: string;
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

export function ProposalDetail({ proposal, impact, scope }: ProposalDetailProps) {
  const { locale, t } = useLanguage();
  const copy = labels[locale];

  return (
    <>
      <PageHeader
        action={<ButtonLink href={buildScopedHref(`/context-packs/ctx-${proposal.id.replace(/^proposal-/, "")}`, scope)}>{t("action.generateContextPack")}</ButtonLink>}
        description={proposal.description}
        title={proposal.title}
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
            [copy.background, <MultilineText key="background" value={proposal.background} />],
            [copy.goal, <MultilineText key="goal" value={proposal.goal} />],
            [copy.nonGoal, <MultilineText key="nonGoal" value={proposal.nonGoal} />],
            [copy.scope, <MultilineText key="scope" value={proposal.scope} />],
            [copy.rollback, <MultilineText key="rollback" value={proposal.rollbackPlan ?? copy.notSpecified} />]
          ]} />
        </Card>
        <Card>
          <h2 className="mb-3 text-base font-semibold">{copy.impactAnalysis}</h2>
          <DataTable columns={[copy.asset, copy.type]} rows={proposal.impactedAssets.map((asset) => [
            <Link className="text-accent" href={buildScopedHref(assetHref(asset.type, asset.id), scope)} key={asset.id}>{asset.label}</Link>,
            <Badge key="type" tone="blue">{asset.type}</Badge>
          ])} />
        </Card>
      </div>
      <Card className="mt-6">
        <h2 className="mb-3 text-base font-semibold">{copy.implementationTasks}</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm">{proposal.specChanges.map((task) => <li key={task}>{task}</li>)}</ul>
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
