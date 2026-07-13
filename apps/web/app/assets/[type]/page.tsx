import Link from "next/link";
import { Badge, ButtonLink, Card, DataTable, PageHeader } from "../../../components/ui";
import { assetTitleKeys, getRouteAssetsWithDatabase, routeToAssetType, type AssetRouteType } from "../../../lib/assets";
import type { Asset } from "@specforge/core";
import { T } from "../../../components/language-provider";
import { LocalizedSearchInput } from "../../../components/localized-search-input";
import { buildScopedHref } from "../../../lib/scope";

export default async function AssetListPage({ params, searchParams }: { params: Promise<{ type: AssetRouteType }>; searchParams: Promise<{ q?: string; scope?: string }> }) {
  const { type } = await params;
  const { q = "", scope = "" } = await searchParams;
  const assets = (await getRouteAssetsWithDatabase(type, scope)).filter((asset) => `${assetName(asset)} ${assetDescription(asset)}`.toLowerCase().includes(q.toLowerCase()));
  const assetType = routeToAssetType(type);

  return (
    <>
      <PageHeader title={<T k={assetTitleKeys[type]} />} description={<T k="asset.browseDescription" />} action={<ButtonLink href={buildScopedHref(`/assets/${type}/new`, scope)}><T k="action.new" /></ButtonLink>} />
      <Card className="mb-4">
        <form className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <input name="scope" type="hidden" value={scope} />
          <LocalizedSearchInput defaultValue={q} />
          <div className="text-sm text-muted">{assets.length} <T k="asset.countSuffix" /></div>
        </form>
      </Card>
      <DataTable
        columns={[<T k="table.name" key="name" />, <T k="table.type" key="type" />, <T k="table.description" key="description" />, <T k="table.updated" key="updated" />, <T k="table.details" key="details" />]}
        rows={assets.map((asset) => [
          <div key="name">
            <Link className="font-semibold text-ink hover:text-accent" href={buildScopedHref(`/assets/${type}/${asset.id}`, scope)}>{assetName(asset)}</Link>
            <div className="mt-1 font-mono text-xs text-muted">{asset.id}</div>
          </div>,
          <Badge key="type" tone="blue">{assetType}</Badge>,
          <span className="line-clamp-2" key="desc">{assetDescription(asset)}</span>,
          new Date(assetUpdatedAt(asset)).toLocaleDateString("zh-CN"),
          <Link className="font-medium text-accent" href={buildScopedHref(`/assets/${type}/${asset.id}`, scope)} key="details"><T k="action.details" /></Link>
        ])}
      />
    </>
  );
}

function assetName(asset: Asset): string {
  if ("title" in asset) return asset.title;
  return asset.name;
}

function assetDescription(asset: Asset): string {
  return "description" in asset ? asset.description : "Generated AI Context Pack";
}

function assetUpdatedAt(asset: Asset): string {
  return "updatedAt" in asset ? asset.updatedAt : asset.createdAt;
}
