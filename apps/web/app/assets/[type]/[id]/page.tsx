import ReactMarkdown from "react-markdown";
import { Badge, Card, DataTable, PageHeader } from "../../../../components/ui";
import { assetTitleKeys, getRouteAsset, routeToAssetType, type AssetRouteType } from "../../../../lib/assets";
import { renderAssetSummary, runGovernanceChecks } from "@specforge/core";
import { T } from "../../../../components/language-provider";
import { SpecializedAssetSections } from "../../../../components/asset-detail-sections";
import { ButtonLink } from "../../../../components/ui";

export default async function AssetDetailPage({ params }: { params: Promise<{ type: AssetRouteType; id: string }> }) {
  const { type, id } = await params;
  const asset = getRouteAsset(type, id) as Record<string, any>;
  const checks = await runGovernanceChecks(routeToAssetType(type), id);
  const summary = await renderAssetSummary(routeToAssetType(type), id);
  const title = asset.title ?? asset.name;

  return (
    <>
      <PageHeader title={title} description={<T k={assetTitleKeys[type]} />} action={<ButtonLink href={`/assets/${type}/${id}/edit`}><T k="action.edit" /></ButtonLink>} />
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <h2 className="mb-3 text-base font-semibold"><T k="asset.basicInfo" /></h2>
          <DataTable columns={[<T k="table.field" key="field" />, <T k="table.value" key="value" />]} rows={[
            [<T k="field.id" key="id" />, id],
            [<T k="field.type" key="type-label" />, <Badge key="type" tone="blue">{routeToAssetType(type)}</Badge>],
            [<T k="field.domain" key="domain" />, asset.domainId ?? <T k="field.crossDomain" key="cross-domain" />],
            [<T k="field.updated" key="updated" />, new Date(asset.updatedAt ?? asset.createdAt).toLocaleString("zh-CN")]
          ]} />
        </Card>
        <Card>
          <h2 className="mb-3 text-base font-semibold"><T k="asset.markdownDescription" /></h2>
          <div className="prose max-w-none text-sm">
            <ReactMarkdown>{`### ${title}\n\n${asset.description ?? ""}\n\n${summary}`}</ReactMarkdown>
          </div>
        </Card>
      </div>
      <SpecializedAssetSections assetType={routeToAssetType(type)} asset={asset} />
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
