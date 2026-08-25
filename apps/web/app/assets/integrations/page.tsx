import { Card, PageHeader } from "../../../components/ui";
import { IntegrationAtlasCanvas } from "../../../components/integration-atlas-canvas";
import { T } from "../../../components/language-provider";
import { getRequestLocale } from "../../../lib/locale";
import { getRequestPrincipal } from "../../../lib/request-principal";
import { listReadableApplicationServices, requireReadableApplicationService } from "../../../lib/scope";
import { loadIntegrationAtlas } from "../../../lib/integrations/atlas";
import type { MessageKey } from "../../../lib/i18n";

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope = "" } = await searchParams;
  const locale = await getRequestLocale();
  const principal = await getRequestPrincipal();
  const readable = listReadableApplicationServices(principal);
  let activeScopeId: string | undefined;
  try {
    activeScopeId = scope ? requireReadableApplicationService(scope, principal).id : undefined;
  } catch {
    activeScopeId = undefined;
  }
  const atlas = await loadIntegrationAtlas(readable, activeScopeId, { language: locale });
  const empty = atlas.contracts.length === 0;

  return (
    <>
      <PageHeader title={<T k="integrations.atlasTitle" />} description={<T k="integrations.atlasDescription" />} />
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-border bg-chrome px-2.5 py-1 font-medium text-ink"><T k="integrations.coverageScopes" />: {atlas.coverage.scopesInspected}</span>
        <span className="rounded-full border border-border bg-chrome px-2.5 py-1 font-medium text-ink"><T k="integrations.coverageContracts" />: {atlas.coverage.contractsScanned}</span>
        <span className="rounded-full border border-border bg-amber-50 px-2.5 py-1 font-medium text-amber-700"><T k="integrations.restrictedTargets" />: {atlas.coverage.restrictedTargets}</span>
        <span className="rounded-full border border-border bg-amber-50 px-2.5 py-1 font-medium text-amber-700"><T k="integrations.unresolvedTargets" />: {atlas.coverage.unresolvedTargets}</span>
        {atlas.partial ? <span className="rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-700" data-testid="integrations-partial"><T k="integrations.partialNotice" /> · {atlas.partial.reason}</span> : null}
      </div>
      <IntegrationAtlasCanvas nodes={atlas.nodes} edges={atlas.edges} partialReason={atlas.partial?.reason ?? null} language={locale === "zh" ? "zh" : "en"} />
      {empty ? (
        <Card className="mt-4 p-6 text-center text-sm text-muted"><T k="integrations.emptyContracts" /></Card>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ContractSection titleKey="integrations.outbound" contracts={activeScopeId ? atlas.outbound : []} showOwnerScope={false} />
          <ContractSection titleKey="integrations.inbound" contracts={atlas.inbound} showOwnerScope />
        </div>
      )}
      {!empty && activeScopeId ? <p className="mt-3 text-xs text-muted"><T k="integrations.inboundCoverageNote" /></p> : null}
    </>
  );
}

function ContractSection({ titleKey, contracts, showOwnerScope }: { titleKey: MessageKey; contracts: Awaited<ReturnType<typeof loadIntegrationAtlas>>["outbound"]; showOwnerScope: boolean }) {
  return (
    <Card className="p-0">
      <div className="border-b border-border px-4 py-3 text-sm font-semibold text-ink"><T k={titleKey} /></div>
      {contracts.length === 0 ? (
        <p className="px-4 py-5 text-xs text-muted">—</p>
      ) : (
        <ul className="divide-y divide-border">
          {contracts.map((contract) => (
            <li key={contract.contractId} className="px-4 py-3" data-testid="integration-contract-row">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold text-ink">{contract.sourceSystem}</span>
                <span className="text-muted">→</span>
                <span className="font-mono text-xs font-semibold text-ink">{contract.targetSystem}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{contract.protocolKind}</span>
                {showOwnerScope ? <span className="rounded bg-chrome px-1.5 py-0.5 text-[10px] text-muted">{contract.consumerScopeId}</span> : null}
                {contract.lifecycle !== "ACTIVE" ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">{contract.lifecycle}</span> : null}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted">
                <span><T k="integrations.callKey" />: <code>{contract.integrationCallKey}</code></span>
                <span><T k="integrations.locator" />: <code>{contract.protocolLocator || "—"}</code></span>
                <span><T k="integrations.resolution" />: {contract.resolutionStatus}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
