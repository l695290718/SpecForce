import { NextResponse } from "next/server";
import { identity, requireWebUser } from "../../../../lib/identity/server";

export async function POST(request: Request) {
  try {
    const actor = await requireWebUser();
    if (!actor.isAdministrator) throw new Error("OPERATION_DENIED");
    const input = await request.json() as { login: string; displayName: string; password: string; isAdministrator?: boolean };
    return NextResponse.json(await identity().createUser({ ...input, actorId: actor.id }));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "REQUEST_REJECTED" }, { status: 403 }); }
}
