import { NextResponse } from "next/server";
import { identity, requireMutationUser, requireWebUser } from "../../../../lib/identity/server";

export async function GET() {
  try {
    const actor = await requireWebUser();
    return NextResponse.json({ agents: await identity().listOwnedAgents(actor.id) });
  } catch (error) {
    return identityErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireMutationUser(request);
    const input = await request.json() as { name: string };
    return NextResponse.json(await identity().createAgent({ ownerUserId: actor.id, name: input.name, actorId: actor.id }));
  } catch (error) { return identityErrorResponse(error); }
}

function identityErrorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "REQUEST_REJECTED";
  return NextResponse.json({ error: code }, { status: code === "AUTHENTICATION_REQUIRED" ? 401 : 403 });
}
