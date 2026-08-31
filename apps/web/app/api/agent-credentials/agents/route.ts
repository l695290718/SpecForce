import { NextResponse } from "next/server";
import { identity, requireMutationUser } from "../../../../lib/identity/server";

export async function POST(request: Request) {
  try {
    const actor = await requireMutationUser(request);
    const input = await request.json() as { name: string };
    return NextResponse.json(await identity().createAgent({ ownerUserId: actor.id, name: input.name, actorId: actor.id }));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "REQUEST_REJECTED" }, { status: 403 }); }
}
