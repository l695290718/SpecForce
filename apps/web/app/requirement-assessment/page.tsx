import Link from "next/link";
import { AssessmentIntakeForm } from "../../components/requirement-assessment/intake-form";
import { Badge, Card, DataTable, PageHeader } from "../../components/ui";
import { T } from "../../components/language-provider";
import { getRequestPrincipal } from "../../lib/request-principal";
import { getRequestLocale } from "../../lib/locale";
import { buildScopedHref } from "../../lib/scope";
import { listRequirementAssessments } from "../../lib/requirement-assessment";

export default async function RequirementAssessmentPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const scope = (await searchParams).scope ?? "";
  const principal = await getRequestPrincipal();
  const data = await listRequirementAssessments(scope, principal);
  const locale = await getRequestLocale();
  return <>
    <PageHeader title={<T k="assessment.title" />} description={<T k="assessment.description" />} />
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
      <Card><div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold"><T k="assessment.status" /></h2><Badge tone="blue">{data.architectureScope.id}</Badge></div>
        {data.runs.length === 0 ? <p className="py-8 text-sm text-muted"><T k="assessment.empty" /></p> : <DataTable columns={[<T k="table.title" key="title" />, <T k="assessment.status" key="status" />, <T k="assessment.stage" key="stage" />, <T k="assessment.open" key="open" />]} rows={data.runs.map((run) => [run.requirementId, <Badge key="status" tone={run.status === "COMPLETE" ? "green" : run.status === "FAILED" ? "red" : "amber"}>{run.status}</Badge>, run.stage, <Link className="text-accent" href={buildScopedHref(`/requirement-assessment/${run.id}`, scope)} key="link"><T k="assessment.open" /></Link>])} />}
      </Card>
      <Card><h2 className="mb-4 text-base font-semibold"><T k="assessment.new" /></h2><AssessmentIntakeForm scope={scope} /><p className="mt-4 text-xs leading-relaxed text-muted"><T k="assessment.mcpBoundary" /></p></Card>
    </div>
  </>;
}
