import { NextResponse } from "next/server";
import { getProposalsWithDatabase } from "../../../lib/assets";
import { withRequestLocale } from "../../../lib/locale";
import { resolveRequestPrincipal } from "../../../lib/request-principal";

export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope") ?? "";
  const principal = await resolveRequestPrincipal(request);
  return NextResponse.json(await withRequestLocale(request, (locale) => getProposalsWithDatabase(scope, locale, principal)));
}
