import { assetCollections, type AssetType, type GovernanceCheckResult, type SpecForgeDataStore } from "@specforge/core";

const designAssetTypes = (Object.keys(assetCollections) as AssetType[]).filter(
  (type) => type !== "proposal" && type !== "contextPack"
);

export type DashboardSpecificShortcut = "mcpTools" | "proposalLifecycle" | "selfContextPack";

export interface DashboardScopeView {
  assetCounts: Array<{ type: AssetType; count: number }>;
  designAssetCount: number;
  proposalCount: number;
  contextPackCount: number;
  proposalLinkedAssetCount: number;
  businessRuleCount: number;
  governanceIssueCount: number;
  showSelfDesignProposal: boolean;
  specificShortcuts: DashboardSpecificShortcut[];
  pipeline: { proposals: number; assets: number; rules: number; contextPacks: number };
}

export function buildDashboardScopeView(
  catalog: SpecForgeDataStore,
  governanceResults: GovernanceCheckResult[]
): DashboardScopeView {
  const assetCounts = designAssetTypes.map((type) => ({
    type,
    count: catalog[assetCollections[type]].length
  }));
  const designAssetCount = assetCounts.reduce((sum, item) => sum + item.count, 0);
  const proposalLinkedAssetCount = new Set(
    catalog.proposals.flatMap((proposal) => proposal.impactedAssets.map((ref) => `${ref.type}:${ref.id}`))
  ).size;
  const specificShortcuts: DashboardSpecificShortcut[] = [];

  if (catalog.apis.some((api) => api.id === "api-specforge-mcp-tools")) specificShortcuts.push("mcpTools");
  if (catalog.stateMachines.some((machine) => machine.id === "sm-specforge-proposal-lifecycle")) {
    specificShortcuts.push("proposalLifecycle");
  }
  if (catalog.contextPacks.some((pack) => pack.id === "ctx-specforge-self-design")) {
    specificShortcuts.push("selfContextPack");
  }

  return {
    assetCounts,
    designAssetCount,
    proposalCount: catalog.proposals.length,
    contextPackCount: catalog.contextPacks.length,
    proposalLinkedAssetCount,
    businessRuleCount: catalog.businessRules.length,
    governanceIssueCount: governanceResults.filter((result) => result.status === "fail").length,
    showSelfDesignProposal: catalog.proposals.some((proposal) => proposal.id === "proposal-specforge-self-design"),
    specificShortcuts,
    pipeline: {
      proposals: catalog.proposals.length,
      assets: designAssetCount,
      rules: catalog.businessRules.length,
      contextPacks: catalog.contextPacks.length
    }
  };
}
