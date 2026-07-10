import { NextResponse } from "next/server";
import { buildAssetGraph, type AssetType } from "@specforge/core";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return NextResponse.json(await buildAssetGraph(url.searchParams.get("domainId") ?? undefined, (url.searchParams.get("assetType") || undefined) as AssetType | undefined));
}
