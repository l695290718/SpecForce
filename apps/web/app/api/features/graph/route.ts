import { NextResponse } from "next/server";
import { FeatureReadError, getScopedFeatureGraph } from "../../../../lib/features";
import { resolveRequestPrincipal } from "../../../../lib/request-principal";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const principal = await resolveRequestPrincipal(request);
    return NextResponse.json(await getScopedFeatureGraph(url.searchParams.get("scope") ?? "", { root: url.searchParams.get("root") ?? undefined, depth: bounded(url.searchParams.get("depth"), 2, 3), limit: bounded(url.searchParams.get("limit"), 300, 500), locale: url.searchParams.get("locale") === "zh" ? "zh" : "en" }, principal));
  } catch (error) { const code = error instanceof Error ? error.message : "FEATURE_PROJECTION_UNAVAILABLE"; return NextResponse.json({ code }, { status: error instanceof FeatureReadError ? error.status : code.includes("authorized") ? 403 : 503 }); }
}

function bounded(value: string | null, fallback: number, max: number): number { const parsed = Number.parseInt(value ?? "", 10); return Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, max)) : fallback; }
