import { NextResponse } from "next/server";
import { getRequirementAssessment } from "../../../../lib/requirement-assessment";
import { resolveRequestPrincipal } from "../../../../lib/request-principal";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const url = new URL(request.url);
    return NextResponse.json(await getRequirementAssessment((await params).id, url.searchParams.get("scope") ?? "", await resolveRequestPrincipal(request)));
  } catch (error) {
    const code = error instanceof Error ? error.message : "ASSESSMENT_REQUEST_FAILED";
    return NextResponse.json({ code }, { status: code === "ASSESSMENT_NOT_FOUND" ? 404 : 400 });
  }
}
