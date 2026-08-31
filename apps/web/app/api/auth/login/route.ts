import { NextResponse } from "next/server";
import { loginUser, sessionCookie } from "../../../../lib/identity/server";

export async function POST(request: Request) {
  try {
    const input = await request.json() as { login?: string; password?: string };
    if (!input.login || !input.password) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    const result = await loginUser(input.login, input.password);
    const response = NextResponse.json({ userId: result.userId, sessionId: result.sessionId });
    response.cookies.set(sessionCookie(result.secret));
    return response;
  } catch { return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 }); }
}
