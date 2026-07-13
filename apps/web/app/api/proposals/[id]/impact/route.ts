import { NextResponse } from "next/server";
import { analyzeProposalImpact } from "@specforge/core";
import { getProposalWithDatabase } from "../../../../../lib/assets";
import { getApiRequestLocale } from "../../../../../lib/locale";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = getApiRequestLocale(request);
  await getProposalWithDatabase(id, new URL(request.url).searchParams.get("scope") ?? "", locale);
  return NextResponse.json(await analyzeProposalImpact(id));
}
