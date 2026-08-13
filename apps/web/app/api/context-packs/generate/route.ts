import { NextResponse } from "next/server";
import { generateScopedContextPack } from "../../../../lib/assets";
import { getApiRequestLocale } from "../../../../lib/locale";
import { resolveRequestPrincipal } from "../../../../lib/request-principal";

export async function POST(request: Request) {
  const body = (await request.json()) as { proposalId?: string; scope?: string };
  if (!body.proposalId) {
    return NextResponse.json({ error: "proposalId is required" }, { status: 400 });
  }
  const principal = await resolveRequestPrincipal(request);
  return NextResponse.json(await generateScopedContextPack(body.proposalId, body.scope ?? "", getApiRequestLocale(request), principal));
}
