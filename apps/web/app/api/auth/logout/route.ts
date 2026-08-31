import { NextResponse } from "next/server";
import { logoutUser } from "../../../../lib/identity/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  await logoutUser();
  response.cookies.delete("__Host-specforge_session");
  return response;
}
