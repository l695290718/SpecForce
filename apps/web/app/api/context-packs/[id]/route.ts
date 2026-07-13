import { NextResponse } from "next/server";
import { getContextPackWithDatabase } from "../../../../lib/assets";
import { withRequestLocale } from "../../../../lib/locale";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = new URL(request.url).searchParams.get("scope") ?? "";
  return NextResponse.json(await withRequestLocale(request, (locale) => getContextPackWithDatabase(id, scope, locale)));
}
