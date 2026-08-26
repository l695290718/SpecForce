import { NextResponse } from "next/server";
import { createRequirementAssessment, listRequirementAssessments } from "../../../lib/requirement-assessment";
import { resolveRequestPrincipal } from "../../../lib/request-principal";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return NextResponse.json(await listRequirementAssessments(url.searchParams.get("scope") ?? "", await resolveRequestPrincipal(request)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const principal = await resolveRequestPrincipal(request);
    const intent = body.intent as { en?: string; zh?: string } | undefined;
    if (!body.scope || !body.requirementId || !intent?.en || !intent.zh || !body.idempotencyKey) return NextResponse.json({ code: "ASSESSMENT_INPUT_INVALID" }, { status: 400 });
    return NextResponse.json(await createRequirementAssessment({ scopeId: String(body.scope), principal, requirementId: String(body.requirementId), revision: Number(body.revision ?? 1), intent: { en: String(intent.en), zh: String(intent.zh) }, acceptanceCriteria: asLocalized(body.acceptanceCriteria), qualityTargets: asLocalized(body.qualityTargets), constraints: asLocalized(body.constraints), exclusions: asLocalized(body.exclusions), idempotencyKey: String(body.idempotencyKey) }), { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}

function asLocalized(value: unknown): Array<{ en: string; zh: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is { en: string; zh: string } => Boolean(item && typeof item === "object" && "en" in item && "zh" in item));
}

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "ASSESSMENT_REQUEST_FAILED";
  const status = code.includes("NOT_FOUND") ? 404 : code.includes("AUTHORIZED") || code.includes("access") ? 403 : 400;
  return NextResponse.json({ code }, { status });
}
