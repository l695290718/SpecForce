import { NextResponse } from "next/server";
import { getScopedAssetDetail, routeToAssetType } from "../../../../../lib/assets";
import { getApiRequestLocale } from "../../../../../lib/locale";

export async function GET(request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  const assetType = routeToAssetType(type);
  const locale = getApiRequestLocale(request);
  const scope = new URL(request.url).searchParams.get("scope") ?? "";
  return NextResponse.json(await getScopedAssetDetail(assetType, id, scope, locale));
}
