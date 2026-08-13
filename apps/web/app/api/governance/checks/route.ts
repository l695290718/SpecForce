import { NextResponse } from "next/server";
import { getScopedGovernanceOverview } from "../../../../lib/assets";
import { getApiRequestLocale } from "../../../../lib/locale";
import { resolveRequestPrincipal } from "../../../../lib/request-principal";

export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope") ?? "";
  const principal = await resolveRequestPrincipal(request);
  return NextResponse.json(await getScopedGovernanceOverview(scope, getApiRequestLocale(request), principal));
}
