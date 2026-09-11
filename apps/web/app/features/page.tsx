import { PageHeader } from "../../components/ui";
import { FeatureWorkspace, type FeatureWorkspaceView } from "../../components/features/feature-workspace";
import { getScopedFeatureDetail, getScopedFeatureGraph, listScopedFeatures } from "../../lib/features";
import { getRequestLocale } from "../../lib/locale";
import { getRequestPrincipal } from "../../lib/request-principal";

export default async function FeaturesPage({ searchParams }: { searchParams: Promise<{ scope?: string; locale?: string; view?: string; q?: string; cursor?: string; selection?: string; graphMode?: string }> }) {
  const params = await searchParams;
  const scope = params.scope ?? "";
  const locale = params.locale === "en" || params.locale === "zh" ? params.locale : await getRequestLocale();
  const view: FeatureWorkspaceView = params.view === "functional" || params.view === "graph" ? params.view : "service";
  const principal = await getRequestPrincipal();
  const initialData = await listScopedFeatures(scope, { kind: view === "service" ? "serviceFeature" : view === "functional" ? "functionalFeature" : undefined, query: params.q, locale, limit: 25, cursor: params.cursor }, principal);
  const graphMode = params.graphMode === "all" ? "all" : "feature";
  const [selected, graph] = await Promise.all([params.selection && view !== "graph" ? getScopedFeatureDetail(scope, params.selection, locale, principal) : undefined, view === "graph" ? getScopedFeatureGraph(scope, { depth: 2, limit: graphMode === "all" ? 300 : 180, locale, mode: graphMode }, principal) : undefined]);
  return <><PageHeader title={locale === "zh" ? "特性" : "Features"} description={locale === "zh" ? "以价值能力和可观察功能为核心，连接 API、数据、事件、规则、质量与架构事实。" : "Connect value capabilities and observable functions to APIs, data, events, rules, quality, and architecture facts."} /><FeatureWorkspace graph={graph} initialData={initialData} initialView={view} locale={locale} query={params.q} scope={scope} selected={selected} /></>;
}
