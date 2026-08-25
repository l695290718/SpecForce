import { NextResponse } from "next/server";
import { loadIntegrationAtlas } from "../../../../lib/integrations/atlas";
import { getRequestPrincipal } from "../../../../lib/request-principal";
import { listReadableApplicationServices } from "../../../../lib/scope";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const principal = await getRequestPrincipal();
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") ?? undefined;
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const language = url.searchParams.get("lang") ?? undefined;
    const readable = listReadableApplicationServices(principal);
    const page = await loadIntegrationAtlas(readable, scope, { cursor, language });
    return NextResponse.json(page);
  } catch (error) {
    const code = error instanceof Error && error.message === "ATLAS_CURSOR_INVALID" ? "ATLAS_CURSOR_INVALID" : "ATLAS_UNAVAILABLE";
    return NextResponse.json({ code }, { status: code === "ATLAS_CURSOR_INVALID" ? 400 : 503 });
  }
}
