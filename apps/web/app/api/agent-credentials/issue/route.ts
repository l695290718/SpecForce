import { NextResponse } from "next/server";
import { identity, requireMutationUser } from "../../../../lib/identity/server";

export async function POST(request: Request) {
  try {
    const actor = await requireMutationUser(request);
    const input = await request.json() as { agentId: string; ceiling: Array<{ applicationServiceId: string; operation: never }>; expiresAt: string };
    const result = await identity().createAgentCredential({ ownerUserId: actor.id, agentId: input.agentId, ceiling: input.ceiling, expiresAt: new Date(input.expiresAt), actorId: actor.id });
    return NextResponse.json(result);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "REQUEST_REJECTED" }, { status: 403 }); }
}
