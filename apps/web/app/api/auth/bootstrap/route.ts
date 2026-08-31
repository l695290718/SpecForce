import { NextResponse } from "next/server";
import { identity } from "../../../../lib/identity/server";

export async function POST(request: Request) {
  try {
    const expectedOrigin = process.env.SPECFORGE_WEB_ORIGIN;
    if (!request.headers.get("origin") || (expectedOrigin && request.headers.get("origin") !== expectedOrigin)) return NextResponse.json({ error: "ORIGIN_REJECTED" }, { status: 403 });
    const input = await request.json() as { login?: string; displayName?: string; password?: string };
    if (!input.login || !input.displayName || !input.password) return NextResponse.json({ error: "BOOTSTRAP_INPUT_REQUIRED" }, { status: 400 });
    const result = await identity().bootstrapFirstAdministrator({ login: input.login, displayName: input.displayName, password: input.password });
    return NextResponse.json({ status: "COMPLETED", ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "IDENTITY_BOOTSTRAP_FAILED";
    return NextResponse.json({ error: message }, { status: message === "IDENTITY_BOOTSTRAP_ALREADY_COMPLETED" ? 409 : 400 });
  }
}
