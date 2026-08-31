import { NextResponse } from "next/server";
import { identity, requireMutationUser } from "../../../../lib/identity/server";

export async function POST(request: Request) {
  try {
    const actor = await requireMutationUser(request);
    if (!actor.isAdministrator) throw new Error("OPERATION_DENIED");
    const input = await request.json() as { userId: string; applicationServiceId: string; operation: Parameters<ReturnType<typeof identity>["grantOperation"]>[0]["operation"] };
    await identity().grantOperation({ ...input, actorId: actor.id });
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "REQUEST_REJECTED" }, { status: 403 }); }
}
