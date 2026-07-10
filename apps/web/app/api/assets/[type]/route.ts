import { NextResponse } from "next/server";
import { listAssets, type AssetType } from "@specforge/core";
import { routeToAssetType } from "../../../../lib/assets";

export async function GET(_: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const assetType = routeToAssetType(type) as AssetType;
  return NextResponse.json(listAssets(assetType));
}
