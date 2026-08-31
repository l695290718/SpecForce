import { NextResponse } from "next/server";
import { logoutUser, requireMutationUser } from "../../../../lib/identity/server";

export async function POST(request: Request) {
  try { await requireMutationUser(request); } catch { return NextResponse.json({ error: "CSRF_ORIGIN_REJECTED" }, { status: 403 }); }
  const response = NextResponse.json({ ok: true });
  await logoutUser();
  response.cookies.delete("__Host-specforge_session");
  return response;
}
