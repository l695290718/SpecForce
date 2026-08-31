import { NextResponse } from "next/server";
import { identity, requireWebUser } from "../../../../lib/identity/server";

export async function POST(request: Request) {
  try {
    const actor = await requireWebUser();
    const input = await request.json() as { credentialId: string; expiresAt: string };
    return NextResponse.json(await identity().rotateAgentCredential({ credentialId: input.credentialId, ownerUserId: actor.id, actorId: actor.id, expiresAt: new Date(input.expiresAt) }));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "REQUEST_REJECTED" }, { status: 403 }); }
}
