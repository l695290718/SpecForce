import { NextResponse } from "next/server";
import { IntegrationAtlasReadError, loadIntegrationAtlas } from "../../../../lib/integrations/atlas";
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
    const page = await loadIntegrationAtlas(readable, scope, { subject: principal.subject, cursor, language });
    return NextResponse.json(page);
  } catch (error) {
    const code = error instanceof IntegrationAtlasReadError ? error.code : "ATLAS_UNAVAILABLE";
    const status = code === "ATLAS_SCOPE_UNAUTHORIZED" ? 403 : code.startsWith("ATLAS_CURSOR") ? 409 : code === "ATLAS_SUBJECT_REQUIRED" ? 401 : 503;
    return NextResponse.json({ code }, { status });
  }
}
