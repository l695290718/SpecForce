import { Card, PageHeader } from "../../../components/ui";
import { T } from "../../../components/language-provider";
import { getRequestPrincipal } from "../../../lib/request-principal";
import { listReadableApplicationServices } from "../../../lib/scope";
import { prisma } from "../../../lib/db";
import type { ScopedPrincipal } from "@specforge/core";
import { compileGovernanceBriefing, type BriefingAssetInput } from "@specforge/core";

async function collectAssets(principal: ScopedPrincipal): Promise<{ rules: BriefingAssetInput[]; adrs: BriefingAssetInput[] }> {
  const readable = listReadableApplicationServices(principal);
  const rules = new Map<string, BriefingAssetInput>();
  const adrs = new Map<string, BriefingAssetInput>();
  for (const scope of readable) {
    const rows = await prisma.designAsset.findMany({
      where: { applicationServiceId: scope.id, scopePath: scope.scopePath, type: { in: ["businessRule", "adr"] } },
      select: { id: true, type: true, payload: true }
    });
    for (const row of rows) {
      const payload = (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as Record<string, unknown>;
      const entry: BriefingAssetInput = {
        id: String(payload.id ?? row.id),
        name: String(payload.name ?? payload.id ?? row.id),
        description: typeof payload.description === "string" ? payload.description : "",
        status: typeof payload.status === "string" ? payload.status : undefined
      };
      if (row.type === "businessRule") rules.set(entry.id, entry);
      if (row.type === "adr") adrs.set(entry.id, entry);
    }
  }
  return { rules: [...rules.values()], adrs: [...adrs.values()] };
}

export default async function GovernanceBriefingPage() {
  const principal = await getRequestPrincipal();
  const { rules, adrs } = await collectAssets(principal);
  const briefing = compileGovernanceBriefing({ rules, adrs });

  return (
    <>
      <PageHeader title={<T k="briefing.title" />} description={<T k="briefing.description" />} />
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-border bg-chrome px-2.5 py-1 font-medium text-ink"><T k="briefing.rules" />: {briefing.counts.rules}</span>
        <span className="rounded-full border border-border bg-chrome px-2.5 py-1 font-medium text-ink">ADR: {briefing.counts.adrsAccepted}</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[10px] text-muted">{briefing.digest}</span>
      </div>
      <Card className="mb-4">
        <div className="text-sm font-semibold text-ink"><T k="briefing.checklist" /></div>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li><T k="briefing.step1" /></li>
          <li><T k="briefing.step2" /></li>
          <li><T k="briefing.step3" /></li>
          <li><T k="briefing.step4" /></li>
          <li><T k="briefing.step5" /></li>
          <li><T k="briefing.step6" /></li>
        </ol>
      </Card>
      <Card className="mb-4 p-0">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold text-ink"><T k="briefing.rules" /> ({briefing.rules.length})</div>
        <ul className="divide-y divide-border">
          {briefing.rules.map((rule) => (
            <li key={rule.id} className="px-4 py-3" data-testid="briefing-rule-row">
              <div className="font-mono text-xs font-semibold text-ink">{rule.id}</div>
              <div className="mt-0.5 text-sm text-muted">{rule.name}{rule.description ? ` — ${rule.description}` : ""}</div>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-0">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold text-ink">ADR ({briefing.acceptedAdrs.length})</div>
        <ul className="divide-y divide-border">
          {briefing.acceptedAdrs.map((adr) => (
            <li key={adr.id} className="px-4 py-2.5" data-testid="briefing-adr-row">
              <span className="font-mono text-xs font-semibold text-ink">{adr.id}</span>
              <span className="ml-2 text-sm text-muted">{adr.name}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
