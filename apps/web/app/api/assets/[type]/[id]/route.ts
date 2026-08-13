import { NextResponse } from "next/server";
import { getScopedAssetDetail, routeToAssetType } from "../../../../../lib/assets";
import { getApiRequestLocale } from "../../../../../lib/locale";
import { resolveRequestPrincipal } from "../../../../../lib/request-principal";

export async function GET(request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  const assetType = routeToAssetType(type);
  const locale = getApiRequestLocale(request);
  const scope = new URL(request.url).searchParams.get("scope") ?? "";
  const principal = await resolveRequestPrincipal(request);
  return NextResponse.json(await getScopedAssetDetail(assetType, id, scope, locale, principal));
}
