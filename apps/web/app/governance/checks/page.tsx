import { runGovernanceChecks, type AssetType, type GovernanceCheckResult } from "@specforge/core";
import { Badge, Card, DataTable, PageHeader } from "../../../components/ui";
import { T } from "../../../components/language-provider";
import { getProposalsWithDatabase, getRouteAssetsWithDatabase } from "../../../lib/assets";

export default async function GovernanceChecksPage({ searchParams }: { searchParams: Promise<{ assetType?: string; severity?: string; status?: string }> }) {
  const filters = await searchParams;
  const [apis, events, dataModels, businessRules, proposals] = await Promise.all([
    getRouteAssetsWithDatabase("apis"),
    getRouteAssetsWithDatabase("events"),
    getRouteAssetsWithDatabase("data-models"),
    getRouteAssetsWithDatabase("rules"),
    getProposalsWithDatabase()
  ]);
  const targets = [
    ...apis.map((asset) => ({ type: "api" as AssetType, id: asset.id, name: asset.name })),
    ...events.map((asset) => ({ type: "event" as AssetType, id: asset.id, name: asset.name })),
    ...dataModels.map((asset) => ({ type: "dataModel" as AssetType, id: asset.id, name: asset.name })),
    ...businessRules.map((asset) => ({ type: "businessRule" as AssetType, id: asset.id, name: asset.name })),
    ...proposals.map((asset) => ({ type: "proposal" as AssetType, id: asset.id, name: asset.title }))
  ];
  const checks = (await Promise.all(targets.map((target) => safeGovernanceChecks(target.type, target.id)))).flat().filter((check) => {
    const matchesType = !filters.assetType || check.assetType === filters.assetType;
    const matchesSeverity = !filters.severity || check.severity === filters.severity;
    const matchesStatus = !filters.status || check.status === filters.status;
    return matchesType && matchesSeverity && matchesStatus;
  });

  return (
    <>
      <PageHeader title={<T k="governance.checksTitle" />} description={<T k="governance.checksDescription" />} />
      <Card className="mb-4">
        <form className="grid gap-3 md:grid-cols-4">
          <select className="h-10 rounded-md border border-border px-3 text-sm" defaultValue={filters.assetType ?? ""} name="assetType">
            <option value=""><T k="filter.allAssetTypes" /></option>
            {["api", "event", "dataModel", "businessRule", "proposal"].map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <select className="h-10 rounded-md border border-border px-3 text-sm" defaultValue={filters.severity ?? ""} name="severity">
            <option value=""><T k="filter.allSeverities" /></option>
            {["error", "warning", "info"].map((severity) => <option key={severity} value={severity}>{severity}</option>)}
          </select>
          <select className="h-10 rounded-md border border-border px-3 text-sm" defaultValue={filters.status ?? ""} name="status">
            <option value=""><T k="filter.allStatuses" /></option>
            {["fail", "pass"].map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <button className="h-10 rounded-md bg-accent px-3 text-sm font-medium text-white"><T k="filter.apply" /></button>
        </form>
      </Card>
      <DataTable columns={[<T k="table.asset" key="asset" />, <T k="table.rule" key="rule" />, <T k="table.severity" key="severity" />, <T k="table.status" key="status" />, <T k="table.reason" key="reason" />, <T k="table.suggestion" key="suggestion" />]} rows={checks.map((check) => [
        `${check.assetType}/${check.assetId}`,
        check.ruleName,
        <Badge key="severity" tone={check.severity === "error" ? "red" : check.severity === "warning" ? "amber" : "neutral"}>{check.severity}</Badge>,
        <span className={check.status === "fail" ? "font-semibold text-rose-700" : ""} key="status"><Badge tone={check.status === "pass" ? "green" : "red"}>{check.status}</Badge></span>,
        check.reason,
        check.suggestion
      ])} />
    </>
  );
}

async function safeGovernanceChecks(assetType: AssetType, assetId: string): Promise<GovernanceCheckResult[]> {
  try {
    return await runGovernanceChecks(assetType, assetId);
  } catch {
    return [];
  }
}
