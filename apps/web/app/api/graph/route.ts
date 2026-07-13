import { NextResponse } from "next/server";
import { type AssetType } from "@specforge/core";
import { getAssetGraphWithDatabase } from "../../../lib/assets";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return NextResponse.json(await getAssetGraphWithDatabase(url.searchParams.get("scope") ?? "", url.searchParams.get("domainId") ?? undefined, (url.searchParams.get("assetType") || undefined) as AssetType | undefined));
}
