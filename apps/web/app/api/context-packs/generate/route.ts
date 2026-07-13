import { NextResponse } from "next/server";
import { generateScopedContextPack } from "../../../../lib/assets";
import { getApiRequestLocale } from "../../../../lib/locale";

export async function POST(request: Request) {
  const body = (await request.json()) as { proposalId?: string; scope?: string };
  if (!body.proposalId) {
    return NextResponse.json({ error: "proposalId is required" }, { status: 400 });
  }
  return NextResponse.json(await generateScopedContextPack(body.proposalId, body.scope ?? "", getApiRequestLocale(request)));
}
