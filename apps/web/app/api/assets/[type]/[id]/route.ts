import { NextResponse } from "next/server";
import { localizeGovernanceResult, runGovernanceChecks, type AssetType } from "@specforge/core";
import { getRouteAssetWithDatabase, routeToAssetType } from "../../../../../lib/assets";
import { getApiRequestLocale } from "../../../../../lib/locale";

export async function GET(request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  const assetType = routeToAssetType(type) as AssetType;
  const locale = getApiRequestLocale(request);
  const scope = new URL(request.url).searchParams.get("scope") ?? "";
  return NextResponse.json({
    asset: await getRouteAssetWithDatabase(type, id, scope, locale),
    governance: (await runGovernanceChecks(assetType, id)).map((result) => localizeGovernanceResult(result, locale))
  });
}
