import { NextResponse } from "next/server";
import { generateContextPack } from "@specforge/core";

export async function POST(request: Request) {
  const body = (await request.json()) as { proposalId?: string };
  if (!body.proposalId) {
    return NextResponse.json({ error: "proposalId is required" }, { status: 400 });
  }
  return NextResponse.json(await generateContextPack(body.proposalId));
}
