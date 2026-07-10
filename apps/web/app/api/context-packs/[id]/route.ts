import { NextResponse } from "next/server";
import { generateContextPack } from "@specforge/core";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposalId = id === "ctx-partial-refund" ? "proposal-partial-refund" : id.replace(/^ctx-/, "proposal-");
  return NextResponse.json(await generateContextPack(proposalId));
}
