import { NextResponse } from "next/server";
import { getRouteAssetsWithDatabase } from "../../../../lib/assets";

export async function GET(request: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  return NextResponse.json(await getRouteAssetsWithDatabase(type, new URL(request.url).searchParams.get("scope") ?? ""));
}
