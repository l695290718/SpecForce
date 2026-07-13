import { NextResponse } from "next/server";
import { getRouteAssetsWithDatabase } from "../../../../lib/assets";
import { withRequestLocale } from "../../../../lib/locale";

export async function GET(request: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const scope = new URL(request.url).searchParams.get("scope") ?? "";
  return NextResponse.json(await withRequestLocale(request, (locale) => getRouteAssetsWithDatabase(type, scope, locale)));
}
