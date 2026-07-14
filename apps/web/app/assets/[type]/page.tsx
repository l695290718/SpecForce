import Link from "next/link";
import { Badge, Card, DataTable, PageHeader } from "../../../components/ui";
import { assetTitleKeys, searchScopedAssets, routeToAssetType, type AssetRouteType } from "../../../lib/assets";
import type { Asset } from "@specforge/core";
import { T } from "../../../components/language-provider";
import { LocalizedSearchInput } from "../../../components/localized-search-input";
import { buildScopedHref } from "../../../lib/scope";
import { getRequestLocale, withSearchParams } from "../../../lib/locale";

export default async function AssetListPage({ params, searchParams }: { params: Promise<{ type: AssetRouteType }>; searchParams: Promise<{ q?: string; scope?: string; limit?: string; offset?: string }> }) {
  const { type } = await params;
  const { q = "", scope = "", limit: limitParam, offset: offsetParam } = await searchParams;
  const locale = await getRequestLocale();
  const assetType = routeToAssetType(type);
  const limit = boundedInteger(limitParam, 20, 1, 100);
  const offset = boundedInteger(offsetParam, 0, 0, Number.MAX_SAFE_INTEGER);
  const result = await searchScopedAssets(assetType, scope, q, locale, { limit, offset });
  const assets = result.items.map((item) => item.asset);

  return (
    <>
      <PageHeader title={<T k={assetTitleKeys[type]} />} description={<T k="asset.browseDescription" />} action={<McpManaged locale={locale} />} />
      <Card className="mb-4">
        <form className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <input name="scope" type="hidden" value={scope} />
          <input name="limit" type="hidden" value={limit} />
          <LocalizedSearchInput defaultValue={q} />
          <div className="text-sm text-muted">{result.total} <T k="asset.countSuffix" /></div>
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
      {q.trim() && result.total > result.limit ? (
        <nav className="mt-4 flex justify-end gap-2 text-sm">
          {result.offset > 0 ? <Link className="rounded-md border border-border px-3 py-2" href={withSearchParams(`/assets/${type}`, { scope, q, limit: String(limit), offset: String(Math.max(0, result.offset - limit)) })}>{locale === "zh" ? "\u4e0a\u4e00\u9875" : "Previous"}</Link> : null}
          {result.offset + result.limit < result.total ? <Link className="rounded-md border border-border px-3 py-2" href={withSearchParams(`/assets/${type}`, { scope, q, limit: String(limit), offset: String(result.offset + limit) })}>{locale === "zh" ? "\u4e0b\u4e00\u9875" : "Next"}</Link> : null}
        </nav>
      ) : null}
    </>
  );
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
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
