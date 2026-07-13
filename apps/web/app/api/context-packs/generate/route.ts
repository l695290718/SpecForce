import { NextResponse } from "next/server";
import { generateContextPack } from "@specforge/core";
import { getProposalWithDatabase } from "../../../../lib/assets";
import { getApiRequestLocale } from "../../../../lib/locale";

export async function POST(request: Request) {
  const body = (await request.json()) as { proposalId?: string; scope?: string };
  if (!body.proposalId) {
    return NextResponse.json({ error: "proposalId is required" }, { status: 400 });
  }
  await getProposalWithDatabase(body.proposalId, body.scope ?? "", getApiRequestLocale(request));
  return NextResponse.json(await generateContextPack(body.proposalId));
}
