import ReactMarkdown from "react-markdown";
import { Badge, Card, DataTable, PageHeader } from "../../../../components/ui";
import { assetTitleKeys, getScopedAssetDetail, routeToAssetType, type AssetRouteType } from "../../../../lib/assets";
import { T } from "../../../../components/language-provider";
import { SpecializedAssetSections } from "../../../../components/asset-detail-sections";
import { getRequestLocale } from "../../../../lib/locale";

export default async function AssetDetailPage({ params, searchParams }: { params: Promise<{ type: AssetRouteType; id: string }>; searchParams: Promise<{ scope?: string }> }) {
  const { type, id } = await params;
  const { scope = "" } = await searchParams;
  const locale = await getRequestLocale();
  const assetType = routeToAssetType(type);
  const detail = await getScopedAssetDetail(assetType, id, scope, locale);
  const asset = detail.asset as Record<string, any>;
  const checks = detail.governance;
  const title = asset.title ?? asset.name;

  return (
    <>
      <PageHeader title={title} description={<T k={assetTitleKeys[type]} />} action={<span className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted">{locale === "zh" ? "内容由 MCP 管理" : "Content managed via MCP"}</span>} />
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <h2 className="mb-3 text-base font-semibold"><T k="asset.basicInfo" /></h2>
          <DataTable columns={[<T k="table.field" key="field" />, <T k="table.value" key="value" />]} rows={[
            [<T k="field.id" key="id" />, id],
            [<T k="field.type" key="type-label" />, <Badge key="type" tone="blue">{assetType}</Badge>],
            [<T k="field.domain" key="domain" />, asset.domainId ?? <T k="field.crossDomain" key="cross-domain" />],
            [<T k="field.updated" key="updated" />, new Date(asset.updatedAt ?? asset.createdAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")]
          ]} />
        </Card>
        <Card>
          <h2 className="mb-3 text-base font-semibold"><T k="asset.markdownDescription" /></h2>
          <div className="prose max-w-none text-sm">
            <ReactMarkdown>{detail.markdown}</ReactMarkdown>
          </div>
        </Card>
      </div>
      <SpecializedAssetSections assetType={routeToAssetType(type)} asset={asset} locale={locale} />
      <Card className="mt-6">
        <h2 className="mb-3 text-base font-semibold"><T k="asset.structuredContent" /></h2>
        <pre className="rounded-md bg-slate-950 p-4 text-xs text-slate-50">{JSON.stringify(asset, null, 2)}</pre>
      </Card>
      <Card className="mt-6">
        <h2 className="mb-3 text-base font-semibold"><T k="asset.governanceResults" /></h2>
        <DataTable columns={[<T k="table.rule" key="rule" />, <T k="table.severity" key="severity" />, <T k="table.status" key="status" />, <T k="table.reason" key="reason" />, <T k="table.suggestion" key="suggestion" />]} rows={checks.map((check) => [
          check.ruleName,
          <Badge key="severity" tone={check.severity === "error" ? "red" : check.severity === "warning" ? "amber" : "neutral"}>{check.severity}</Badge>,
          <Badge key="status" tone={check.status === "pass" ? "green" : "red"}>{check.status}</Badge>,
          check.reason,
          check.suggestion
        ])} />
      </Card>
    </>
  );
}
