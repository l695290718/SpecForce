import { NextResponse } from "next/server";
import { FeatureReadError, getScopedFeatureDetail } from "../../../../lib/features";
import { resolveRequestPrincipal } from "../../../../lib/request-principal";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const url = new URL(request.url);
    const principal = await resolveRequestPrincipal(request);
    return NextResponse.json(await getScopedFeatureDetail(url.searchParams.get("scope") ?? "", (await params).id, url.searchParams.get("locale") === "zh" ? "zh" : "en", principal));
  } catch (error) { const code = error instanceof Error ? error.message : "FEATURE_READ_FAILED"; return NextResponse.json({ code }, { status: error instanceof FeatureReadError ? error.status : code.includes("authorized") ? 403 : 503 }); }
}
