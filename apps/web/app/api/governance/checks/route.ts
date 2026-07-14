import { NextResponse } from "next/server";
import { getScopedGovernanceOverview } from "../../../../lib/assets";
import { getApiRequestLocale } from "../../../../lib/locale";

export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope") ?? "";
  return NextResponse.json(await getScopedGovernanceOverview(scope, getApiRequestLocale(request)));
}
