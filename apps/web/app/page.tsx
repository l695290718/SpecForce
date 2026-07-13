import Link from "next/link";
import { Bot, GitPullRequestArrow, ShieldCheck } from "lucide-react";
import { Badge, ButtonLink, Card, DataTable, PageHeader } from "../components/ui";
import { dashboardStats, getAgentServiceWorkspace, getContextPacksWithDatabase, getProposalsWithDatabase, getRouteAssetsWithDatabase, getScopedGovernanceOverview } from "../lib/assets";
import { T } from "../components/language-provider";
import type { MessageKey } from "../lib/i18n";
import { buildScopedHref, listReadableApplicationServices } from "../lib/scope";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRequestLocale } from "../lib/locale";

const defaultScopeId = "com.huawei.celon.desiner";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope } = await searchParams;
  if (!scope) {
    const savedScope = (await cookies()).get("specforge-architecture-scope")?.value;
    const initialScope = listReadableApplicationServices().some((item) => item.id === savedScope) ? savedScope! : defaultScopeId;
    redirect(buildScopedHref("/", initialScope));
  }
  const locale = await getRequestLocale();
  const workspace = await getAgentServiceWorkspace(scope);
  const proposals = await getProposalsWithDatabase(scope, locale);
  const contextPacks = await getContextPacksWithDatabase(scope, locale);
  const adrs = await getRouteAssetsWithDatabase("adrs", scope, locale);
  const warningResults = (await getScopedGovernanceOverview(scope, locale)).filter((result) => result.status === "fail");
  const stats = await dashboardStats(scope);

  return (
    <>
      <PageHeader
        title="SpecForge Design Center"
        description={<>{workspace.agentId} · {workspace.applicationServiceId}</>}
        action={<ButtonLink href={buildScopedHref("/proposals/proposal-specforge-self-design", scope)}><T k="dashboard.viewSelfDesignProposal" /></ButtonLink>}
      />
      <section className="sf-rise sf-scan mb-6 overflow-hidden rounded-lg border border-slate-700 bg-ink p-5 text-white shadow-elevated">
        <div className="relative z-10 grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <div className="mb-3 font-mono text-[11px] font-semibold uppercase text-blue-200"><T k="dashboard.liveLabel" /></div>
            <h2 className="max-w-3xl text-2xl font-semibold tracking-normal"><T k="dashboard.liveTitle" /></h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Signal icon={<GitPullRequestArrow size={16} />} labelKey="dashboard.signalProposal" valueKey="dashboard.signalAssets" />
              <Signal icon={<ShieldCheck size={16} />} labelKey="dashboard.signalGovernance" valueKey="dashboard.signalRules" />
              <Signal icon={<Bot size={16} />} labelKey="dashboard.signalAiProvider" valueKey="dashboard.signalMockReady" />
            </div>
          </div>
          <div className="rounded-lg border border-white/[0.15] bg-white/[0.08] p-4 backdrop-blur">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase text-blue-100"><T k="dashboard.contextPipeline" /></span>
              <span className="flex items-center gap-2 text-xs text-emerald-200"><span className="sf-pulse h-2 w-2 rounded-full bg-emerald-300" /><T k="dashboard.online" /></span>
            </div>
            {(["dashboard.pipelineProposal", "dashboard.pipelineAssets", "dashboard.pipelineRules", "dashboard.pipelineContextPack"] as const).map((itemKey, index) => (
              <div className="mb-3 last:mb-0" key={itemKey}>
                <div className="mb-1 flex justify-between text-xs text-slate-200">
                  <span><T k={itemKey} /></span>
                  <span>{72 + index * 7}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="sf-flow h-full rounded-full bg-gradient-to-r from-blue-300 via-emerald-200 to-blue-300" style={{ width: `${72 + index * 7}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label={<T k="metric.designAssets" />} value={stats.reduce((sum, item) => sum + item.count, 0)} metaKey="metric.metaAssets" />
        <MetricCard label={<T k="metric.proposals" />} value={proposals.length} metaKey="metric.metaProposals" />
        <MetricCard label={<T k="metric.contextPacks" />} value={contextPacks.length} metaKey="metric.metaContextPacks" />
        <MetricCard label={<T k="metric.governanceAlerts" />} value={warningResults.length} metaKey="metric.metaGovernance" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <h2 className="mb-4 text-base font-semibold"><T k="dashboard.assetDistribution" /></h2>
          <DataTable
            columns={[<T k="table.type" key="type" />, <T k="table.count" key="count" />, <T k="table.entry" key="entry" />]}
            rows={stats.map((item) => [
              <Badge key="type" tone="blue">{item.type}</Badge>,
              item.count,
              <Link className="text-accent" href={buildScopedHref(routeForType(item.type), scope)} key="link"><T k="action.open" /></Link>
            ])}
          />
        </Card>
        <Card>
          <h2 className="mb-4 text-base font-semibold"><T k="dashboard.quickLinks" /></h2>
          <div className="grid gap-3">
            {([
              ["quick.mcpTools", "/assets/apis/api-specforge-mcp-tools"],
              ["quick.proposalLifecycle", "/assets/state-machines/sm-specforge-proposal-lifecycle"],
              ["quick.assetGraph", "/graph"],
              ["quick.governanceChecks", "/governance/checks"],
              ["quick.selfContextPack", "/context-packs/ctx-specforge-self-design"]
            ] as const).map(([labelKey, href]) => <Link className="rounded-md border border-border px-3 py-2 text-sm hover:bg-surface" href={buildScopedHref(href, scope)} key={href}><T k={labelKey} /></Link>)}
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

function Signal({ icon, labelKey, valueKey }: { icon: React.ReactNode; labelKey: MessageKey; valueKey: MessageKey }) {
  return (
    <div className="rounded-md border border-white/[0.15] bg-white/[0.08] p-3">
      <div className="mb-2 text-blue-200">{icon}</div>
      <div className="text-xs text-slate-300"><T k={labelKey} /></div>
      <div className="mt-1 text-sm font-semibold"><T k={valueKey} /></div>
    </div>
  );
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
