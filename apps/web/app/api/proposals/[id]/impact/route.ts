import { NextResponse } from "next/server";
import { getScopedProposalImpact } from "../../../../../lib/assets";
import { getApiRequestLocale } from "../../../../../lib/locale";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = getApiRequestLocale(request);
  const scope = new URL(request.url).searchParams.get("scope") ?? "";
  return NextResponse.json(await getScopedProposalImpact(id, scope, locale));
}
