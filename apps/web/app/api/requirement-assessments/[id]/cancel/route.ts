import { NextResponse } from "next/server";
import { cancelRequirementAssessment } from "../../../../../lib/requirement-assessment";
import { resolveRequestPrincipal } from "../../../../../lib/request-principal";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json().catch(() => ({})) as { scope?: string };
    return NextResponse.json(await cancelRequirementAssessment((await params).id, body.scope ?? new URL(request.url).searchParams.get("scope") ?? "", await resolveRequestPrincipal(request)));
  } catch (error) {
    const code = error instanceof Error ? error.message : "ASSESSMENT_CANCEL_FAILED";
    return NextResponse.json({ code }, { status: code === "ASSESSMENT_NOT_FOUND" ? 404 : 400 });
  }
}
