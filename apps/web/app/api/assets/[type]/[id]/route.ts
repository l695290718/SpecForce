import { NextResponse } from "next/server";
import { runGovernanceChecks, type AssetType } from "@specforge/core";
import { getRouteAssetWithDatabase, routeToAssetType } from "../../../../../lib/assets";

export async function GET(request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  const assetType = routeToAssetType(type) as AssetType;
  return NextResponse.json({
    asset: await getRouteAssetWithDatabase(type, id, new URL(request.url).searchParams.get("scope") ?? ""),
    governance: await runGovernanceChecks(assetType, id)
  });
}
