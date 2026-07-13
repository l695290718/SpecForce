import { NextResponse } from "next/server";
import { getRouteAssetsWithDatabase, routeToAssetType, searchScopedAssets } from "../../../../lib/assets";
import { getApiRequestLocale } from "../../../../lib/locale";

export async function GET(request: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "";
  const locale = getApiRequestLocale(request);
  const query = url.searchParams.get("q");
  if (query !== null) {
    const results = await searchScopedAssets(routeToAssetType(type), scope, query, locale);
    return NextResponse.json(results.map((result) => result.asset));
  }
  return NextResponse.json(await getRouteAssetsWithDatabase(type, scope, locale));
}
