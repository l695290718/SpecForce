import { NextResponse } from "next/server";
import { analyzeProposalImpact } from "@specforge/core";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(await analyzeProposalImpact(id));
}
