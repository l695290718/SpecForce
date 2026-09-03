import { NextResponse } from "next/server";
import type { AssetLocale, FeatureAssetType } from "@specforge/core";
import { FeatureReadError, listScopedFeatures } from "../../../lib/features";
import { resolveRequestPrincipal } from "../../../lib/request-principal";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const principal = await resolveRequestPrincipal(request);
    return NextResponse.json(await listScopedFeatures(url.searchParams.get("scope") ?? "", {
      kind: asKind(url.searchParams.get("kind")), query: url.searchParams.get("q") ?? undefined,
      locale: asLocale(url.searchParams.get("locale")), limit: bounded(url.searchParams.get("limit"), 25, 100), cursor: url.searchParams.get("cursor") ?? undefined
    }, principal));
  } catch (error) { return featureError(error); }
}

function asKind(value: string | null): FeatureAssetType | undefined { if (!value) return undefined; if (value === "serviceFeature" || value === "functionalFeature") return value; throw new FeatureReadError("FEATURE_KIND_INVALID", 400); }
function asLocale(value: string | null): AssetLocale { return value === "zh" ? "zh" : "en"; }
function bounded(value: string | null, fallback: number, max: number): number { const parsed = Number.parseInt(value ?? "", 10); return Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, max)) : fallback; }
function featureError(error: unknown) { const code = error instanceof Error ? error.message : "FEATURE_READ_FAILED"; const status = error instanceof FeatureReadError ? error.status : code.includes("authorized") || code.includes("ACCESS") ? 403 : 503; return NextResponse.json({ code }, { status }); }
