import { NextResponse } from "next/server";
import { getProposalsWithDatabase } from "../../../lib/assets";
import { withRequestLocale } from "../../../lib/locale";

export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope") ?? "";
  return NextResponse.json(await withRequestLocale(request, (locale) => getProposalsWithDatabase(scope, locale)));
}
