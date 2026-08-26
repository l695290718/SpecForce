import { notFound } from "next/navigation";
import { AssessmentReport } from "../../../components/requirement-assessment/assessment-report";
import { PageHeader } from "../../../components/ui";
import { T } from "../../../components/language-provider";
import { getRequestPrincipal } from "../../../lib/request-principal";
import { getRequirementAssessment } from "../../../lib/requirement-assessment";

export default async function RequirementAssessmentDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ scope?: string }> }) {
  const { id } = await params;
  const scope = (await searchParams).scope ?? "";
  try {
    const data = await getRequirementAssessment(id, scope, await getRequestPrincipal());
    return <><PageHeader title={data.run?.requirementId ?? data.assessment?.requirementId ?? id} description={<T k="assessment.description" />} /><AssessmentReport data={JSON.parse(JSON.stringify(data))} /></>;
  } catch (error) {
    if (error instanceof Error && error.message === "ASSESSMENT_NOT_FOUND") notFound();
    throw error;
  }
}
