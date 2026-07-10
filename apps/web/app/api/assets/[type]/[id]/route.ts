import { NextResponse } from "next/server";
import { getAsset, runGovernanceChecks, type AssetType } from "@specforge/core";
import { routeToAssetType } from "../../../../../lib/assets";

export async function GET(_: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  const assetType = routeToAssetType(type) as AssetType;
  return NextResponse.json({
    asset: getAsset(assetType, id),
    governance: await runGovernanceChecks(assetType, id)
  });
}
