import { NextResponse } from "next/server";
import { getRouteAssetsWithDatabase, routeToAssetType, searchScopedAssets } from "../../../../lib/assets";
import { getApiRequestLocale } from "../../../../lib/locale";
import { resolveRequestPrincipal } from "../../../../lib/request-principal";

export async function GET(request: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "";
  const locale = getApiRequestLocale(request);
  const principal = await resolveRequestPrincipal(request);
  const query = url.searchParams.get("q");
  if (query !== null) {
    const limit = boundedInteger(url.searchParams.get("limit"), 20, 1, 100);
    const offset = boundedInteger(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
    const results = await searchScopedAssets(routeToAssetType(type), scope, query, locale, { limit, offset }, principal);
    return NextResponse.json({ ...results, items: results.items.map((result) => result.asset) });
  }
  return NextResponse.json(await getRouteAssetsWithDatabase(type, scope, locale, principal));
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
