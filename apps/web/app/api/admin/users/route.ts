import { NextResponse } from "next/server";
import { identity, requireMutationUser, requireWebUser } from "../../../../lib/identity/server";

export async function GET() {
  try {
    const actor = await requireWebUser();
    if (!actor.isAdministrator) throw new Error("OPERATION_DENIED");
    return NextResponse.json({ users: await identity().listUsersWithGrants() });
  } catch (error) {
    return identityErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireMutationUser(request);
    if (!actor.isAdministrator) throw new Error("OPERATION_DENIED");
    const input = await request.json() as { login: string; displayName: string; password: string; isAdministrator?: boolean };
    return NextResponse.json(await identity().createUser({ ...input, actorId: actor.id }));
  } catch (error) { return identityErrorResponse(error); }
}

function identityErrorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "REQUEST_REJECTED";
  return NextResponse.json({ error: code }, { status: code === "AUTHENTICATION_REQUIRED" ? 401 : 403 });
}
