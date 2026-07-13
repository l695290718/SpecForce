import type { AssetType } from "@specforge/core";
import { AssetGraphView } from "../../components/asset-graph";
import { Card, PageHeader } from "../../components/ui";
import { T } from "../../components/language-provider";
import { getAssetGraphWithDatabase, getDomainsWithDatabase } from "../../lib/assets";

export default async function GraphPage({ searchParams }: { searchParams: Promise<{ domainId?: string; assetType?: AssetType; scope?: string }> }) {
  const { domainId, assetType, scope = "" } = await searchParams;
  const graph = await getAssetGraphWithDatabase(scope, domainId, assetType);
  const domains = await getDomainsWithDatabase(scope);
  const assetTypes: AssetType[] = ["dataModel", "api", "event", "businessRule", "stateMachine", "integration", "quality", "observability", "adr", "proposal"];

  return (
    <>
      <PageHeader title={<T k="graph.title" />} description={<T k="graph.description" />} />
      <Card className="mb-4">
        <form className="flex flex-wrap items-center gap-3">
          <input name="scope" type="hidden" value={scope} />
          <label className="text-sm font-medium"><T k="graph.domain" /></label>
          <select className="h-9 rounded-md border border-border px-3 text-sm" name="domainId" defaultValue={domainId ?? ""}>
            <option value=""><T k="graph.allDomains" /></option>
            {domains.map((domain) => <option key={domain.id} value={domain.id}>{domain.name}</option>)}
          </select>
          <label className="text-sm font-medium"><T k="graph.assetType" /></label>
          <select className="h-9 rounded-md border border-border px-3 text-sm" name="assetType" defaultValue={assetType ?? ""}>
            <option value=""><T k="graph.allAssetTypes" /></option>
            {assetTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <button className="h-9 rounded-md bg-accent px-3 text-sm font-medium text-white"><T k="graph.filter" /></button>
        </form>
      </Card>
      <AssetGraphView graph={graph} />
    </>
  );
}
