import Link from "next/link";
import { GitPullRequestArrow, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge, ButtonLink, Card, DataTable, PageHeader } from "../components/ui";
import { getAgentServiceWorkspace, getContextPacksWithDatabase, getProposalsWithDatabase, getRouteAssetsWithDatabase, getScopedAssetCatalog, getScopedGovernanceOverview } from "../lib/assets";
import { T } from "../components/language-provider";
import type { MessageKey } from "../lib/i18n";
import { buildScopedHref, listReadableApplicationServices } from "../lib/scope";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRequestLocale } from "../lib/locale";
import { buildDashboardScopeView, type DashboardSpecificShortcut } from "../lib/dashboard";

const defaultScopeId = "com.huawei.celon.desiner";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope } = await searchParams;
  if (!scope) {
    const savedScope = (await cookies()).get("specforge-architecture-scope")?.value;
    const initialScope = listReadableApplicationServices().some((item) => item.id === savedScope) ? savedScope! : defaultScopeId;
    redirect(buildScopedHref("/", initialScope));
  }
  const locale = await getRequestLocale();
  const [workspace, catalog, proposals, contextPacks, adrs, governanceResults] = await Promise.all([
    getAgentServiceWorkspace(scope),
    getScopedAssetCatalog(scope),
    getProposalsWithDatabase(scope, locale),
    getContextPacksWithDatabase(scope, locale),
    getRouteAssetsWithDatabase("adrs", scope, locale),
    getScopedGovernanceOverview(scope, locale)
  ]);
  const dashboard = buildDashboardScopeView(catalog, governanceResults);
  const quickLinks = buildQuickLinks(dashboard.specificShortcuts);

  return (
    <>
      <PageHeader
        title="SpecForge Design Center"
        description={<>{workspace.agentId} · {workspace.applicationServiceId}</>}
        action={dashboard.showSelfDesignProposal ? <ButtonLink href={buildScopedHref("/proposals/proposal-specforge-self-design", scope)}><T k="dashboard.viewSelfDesignProposal" /></ButtonLink> : undefined}
      />
      <section className="sf-rise sf-scan mb-6 overflow-hidden rounded-lg border border-slate-700 bg-ink p-5 text-white shadow-elevated">
        <div className="relative z-10 grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <div className="mb-3 font-mono text-[11px] font-semibold uppercase text-blue-200"><T k="dashboard.liveLabel" /></div>
            <h2 className="max-w-3xl text-2xl font-semibold tracking-normal"><T k="dashboard.liveTitle" /></h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Signal icon={<GitPullRequestArrow size={16} />} label={<T k="dashboard.signalProposal" />} value={formatCount(dashboard.proposalLinkedAssetCount, locale, "linked assets", "个关联资产")} />
              <Signal icon={<ShieldCheck size={16} />} label={<T k="dashboard.signalGovernance" />} value={formatCount(dashboard.businessRuleCount, locale, "rules", "条规则")} />
              <Signal icon={<ShieldAlert size={16} />} label={<T k="metric.governanceAlerts" />} value={formatCount(dashboard.governanceIssueCount, locale, "open issues", "条待处理")} />
            </div>
          </div>
          <div className="rounded-lg border border-white/[0.15] bg-white/[0.08] p-4 backdrop-blur">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase text-blue-100"><T k="dashboard.contextPipeline" /></span>
              <span className="flex items-center gap-2 text-xs text-emerald-200"><span className="sf-pulse h-2 w-2 rounded-full bg-emerald-300" /><T k="dashboard.online" /></span>
            </div>
            {([
              ["dashboard.pipelineProposal", dashboard.pipeline.proposals],
              ["dashboard.pipelineAssets", dashboard.pipeline.assets],
              ["dashboard.pipelineRules", dashboard.pipeline.rules],
              ["dashboard.pipelineContextPack", dashboard.pipeline.contextPacks]
            ] as const).map(([itemKey, count]) => (
              <div className="mb-2 flex items-center justify-between rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-200 last:mb-0" key={itemKey}>
                <span><T k={itemKey} /></span>
                <span className="font-mono text-sm font-semibold text-white">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label={<T k="metric.designAssets" />} value={dashboard.designAssetCount} metaKey="metric.metaAssets" />
        <MetricCard label={<T k="metric.proposals" />} value={dashboard.proposalCount} metaKey="metric.metaProposals" />
        <MetricCard label={<T k="metric.contextPacks" />} value={dashboard.contextPackCount} metaKey="metric.metaContextPacks" />
        <MetricCard label={<T k="metric.governanceAlerts" />} value={dashboard.governanceIssueCount} metaKey="metric.metaGovernance" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <h2 className="mb-4 text-base font-semibold"><T k="dashboard.assetDistribution" /></h2>
          <DataTable
            columns={[<T k="table.type" key="type" />, <T k="table.count" key="count" />, <T k="table.entry" key="entry" />]}
            rows={dashboard.assetCounts.map((item) => [
              <Badge key="type" tone="blue">{item.type}</Badge>,
              item.count,
              <Link className="text-accent" href={buildScopedHref(routeForType(item.type), scope)} key="link"><T k="action.open" /></Link>
            ])}
          />
        </Card>
        <Card>
          <h2 className="mb-4 text-base font-semibold"><T k="dashboard.quickLinks" /></h2>
          <div className="grid gap-3">
            {quickLinks.map(([labelKey, href]) => <Link className="rounded-md border border-border px-3 py-2 text-sm hover:bg-surface" href={buildScopedHref(href, scope)} key={href}><T k={labelKey} /></Link>)}
          </div>
        </Card>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-base font-semibold"><T k="dashboard.recentProposals" /></h2>
          <DataTable columns={[<T k="table.proposal" key="proposal" />, <T k="table.status" key="status" />, <T k="table.risk" key="risk" />]} rows={proposals.map((proposal) => [
            <Link className="text-accent" href={buildScopedHref(`/proposals/${proposal.id}`, scope)} key={proposal.id}>{proposal.title}</Link>,
            <Badge key="status" tone="amber">{proposal.status}</Badge>,
            proposal.risks[0] ?? <T k="dashboard.noRisk" key="risk" />
          ])} />
        </Card>
        <Card>
          <h2 className="mb-4 text-base font-semibold"><T k="dashboard.recentAdrs" /></h2>
          <DataTable columns={[<T k="nav.adrs" key="adr" />, <T k="table.status" key="status" />, <T k="table.owner" key="owner" />]} rows={adrs.map((adr) => [
            <Link className="text-accent" href={buildScopedHref(`/assets/adrs/${adr.id}`, scope)} key={adr.id}>{"title" in adr ? adr.title : adr.name}</Link>,
            <Badge key="status" tone="green">{"status" in adr ? adr.status : "accepted"}</Badge>,
            "owner" in adr ? adr.owner : "Architecture"
          ])} />
        </Card>
      </div>
    </>
  );
}

function MetricCard({ label, value, metaKey }: { label: React.ReactNode; value: number; metaKey: MessageKey }) {
  return (
    <Card className="sf-rise relative overflow-hidden transition hover:-translate-y-0.5 hover:shadow-elevated">
      <div className="text-sm font-medium text-muted">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-ink">{value}</div>
      <div className="mt-2 text-xs text-muted"><T k={metaKey} /></div>
      <div className="sf-pulse absolute right-4 top-4 h-2 w-2 rounded-full bg-accent" />
    </Card>
  );
}

function Signal({ icon, label, value }: { icon: React.ReactNode; label: React.ReactNode; value: string }) {
  return (
    <div className="rounded-md border border-white/[0.15] bg-white/[0.08] p-3">
      <div className="mb-2 text-blue-200">{icon}</div>
      <div className="text-xs text-slate-300">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function formatCount(count: number, locale: "zh" | "en", englishNoun: string, chineseSuffix: string): string {
  return locale === "zh" ? `${count} ${chineseSuffix}` : `${count} ${englishNoun}`;
}

function buildQuickLinks(specific: DashboardSpecificShortcut[]): Array<[MessageKey, string]> {
  const links: Array<[MessageKey, string]> = [];
  if (specific.includes("mcpTools")) links.push(["quick.mcpTools", "/assets/apis/api-specforge-mcp-tools"]);
  if (specific.includes("proposalLifecycle")) links.push(["quick.proposalLifecycle", "/assets/state-machines/sm-specforge-proposal-lifecycle"]);
  links.push(["quick.assetGraph", "/graph"], ["quick.governanceChecks", "/governance/checks"]);
  if (specific.includes("selfContextPack")) links.push(["quick.selfContextPack", "/context-packs/ctx-specforge-self-design"]);
  return links;
}

function routeForType(type: string): string {
  const routes: Record<string, string> = {
    domain: "/assets/domains",
    dataModel: "/assets/data-models",
    api: "/assets/apis",
    event: "/assets/events",
    businessRule: "/assets/rules",
    stateMachine: "/assets/state-machines",
    integration: "/assets/integrations",
    quality: "/assets/quality",
    observability: "/assets/observability",
    adr: "/assets/adrs"
  };
  return routes[type] ?? "/";
}
