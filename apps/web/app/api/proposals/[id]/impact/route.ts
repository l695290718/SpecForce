import { NextResponse } from "next/server";
import { analyzeProposalImpact } from "@specforge/core";
import { getProposalWithDatabase } from "../../../../../lib/assets";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getProposalWithDatabase(id, new URL(request.url).searchParams.get("scope") ?? "");
  return NextResponse.json(await analyzeProposalImpact(id));
}
