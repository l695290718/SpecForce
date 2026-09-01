import { NextResponse } from "next/server";
import type { Permission } from "@specforge/core";
import { identity, requireMutationUser } from "../../../../lib/identity/server";

export async function POST(request: Request) {
  try {
    const actor = await requireMutationUser(request);
    if (!actor.isAdministrator) throw new Error("OPERATION_DENIED");
    const input = await request.json() as { userId: string; applicationServiceId: string; operation: Parameters<ReturnType<typeof identity>["grantOperation"]>[0]["operation"] };
    await identity().grantOperation({ ...input, actorId: actor.id });
    return NextResponse.json({ ok: true });
  } catch (error) { return identityErrorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireMutationUser(request);
    if (!actor.isAdministrator) throw new Error("OPERATION_DENIED");
    const input = await request.json() as { userId: string; applicationServiceId: string; operation: Permission; reason: string };
    if (!input.reason?.trim()) throw new Error("REASON_REQUIRED");
    await identity().revokeOperation({
      userId: input.userId,
      applicationServiceId: input.applicationServiceId,
      operation: input.operation,
      reason: input.reason.trim(),
      actorId: actor.id
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return identityErrorResponse(error);
  }
}

function identityErrorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "REQUEST_REJECTED";
  return NextResponse.json({ error: code }, { status: code === "AUTHENTICATION_REQUIRED" ? 401 : 403 });
}
