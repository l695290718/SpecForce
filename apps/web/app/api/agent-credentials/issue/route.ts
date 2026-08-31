import { NextResponse } from "next/server";
import type { ScopedOperationGrant } from "@specforge/identity";
import { identity, requireMutationUser } from "../../../../lib/identity/server";

export async function POST(request: Request) {
  try {
    const actor = await requireMutationUser(request);
    const input = await request.json() as { agentId: string; ceiling: unknown; expiresAt: string };
    const ceiling = typeof input.ceiling === "string" ? JSON.parse(input.ceiling) : input.ceiling;
    if (!Array.isArray(ceiling)) throw new Error("INVALID_CREDENTIAL_CEILING");
    const result = await identity().createAgentCredential({ ownerUserId: actor.id, agentId: input.agentId, ceiling: ceiling as ScopedOperationGrant[], expiresAt: new Date(input.expiresAt), actorId: actor.id });
    return NextResponse.json(result);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "REQUEST_REJECTED" }, { status: 403 }); }
}
