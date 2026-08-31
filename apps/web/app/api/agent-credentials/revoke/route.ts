import { NextResponse } from "next/server";
import { identity, requireMutationUser } from "../../../../lib/identity/server";

export async function POST(request: Request) {
  try {
    const actor = await requireMutationUser(request);
    const input = await request.json() as { credentialId: string; reason: string };
    await identity().revokeCredential({ credentialId: input.credentialId, ownerUserId: actor.id, actorId: actor.id, reason: input.reason });
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "REQUEST_REJECTED" }, { status: 403 }); }
}
