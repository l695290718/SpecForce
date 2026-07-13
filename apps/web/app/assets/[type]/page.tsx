import Link from "next/link";
import { Badge, Card, DataTable, PageHeader } from "../../../components/ui";
import { assetTitleKeys, searchScopedAssets, routeToAssetType, type AssetRouteType } from "../../../lib/assets";
import type { Asset } from "@specforge/core";
import { T } from "../../../components/language-provider";
import { LocalizedSearchInput } from "../../../components/localized-search-input";
import { buildScopedHref } from "../../../lib/scope";
import { getRequestLocale } from "../../../lib/locale";

export default async function AssetListPage({ params, searchParams }: { params: Promise<{ type: AssetRouteType }>; searchParams: Promise<{ q?: string; scope?: string }> }) {
  const { type } = await params;
  const { q = "", scope = "" } = await searchParams;
  const locale = await getRequestLocale();
  const assetType = routeToAssetType(type);
  const assets = (await searchScopedAssets(assetType, scope, q, locale)).map((result) => result.asset);

  return (
    <>
      <PageHeader title={<T k={assetTitleKeys[type]} />} description={<T k="asset.browseDescription" />} action={<McpManaged locale={locale} />} />
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
          new Date(assetUpdatedAt(asset)).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US"),
          <Link className="font-medium text-accent" href={buildScopedHref(`/assets/${type}/${asset.id}`, scope)} key="details"><T k="action.details" /></Link>
        ])}
      />
    </>
  );
}

function McpManaged({ locale }: { locale: "zh" | "en" }) {
  return <span className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted">{locale === "zh" ? "内容由 MCP 管理" : "Content managed via MCP"}</span>;
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
