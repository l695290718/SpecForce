import { NextResponse } from "next/server";
import { type AssetType } from "@specforge/core";
import { getAssetGraphWithDatabase } from "../../../lib/assets";
import { getApiRequestLocale } from "../../../lib/locale";
import { resolveRequestPrincipal } from "../../../lib/request-principal";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const principal = await resolveRequestPrincipal(request);
  return NextResponse.json(await getAssetGraphWithDatabase(url.searchParams.get("scope") ?? "", url.searchParams.get("domainId") ?? undefined, (url.searchParams.get("assetType") || undefined) as AssetType | undefined, getApiRequestLocale(request), principal));
}
