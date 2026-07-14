import { assetLabel, getAsset, getDomainName, localizeCatalogAsset } from "../repository";
import { runGovernanceChecks } from "../rules/governance";
import type { AssetRef, DerivedViewOptions, ImpactAnalysis, Proposal } from "../types";

function localizedRef(ref: AssetRef, options: DerivedViewOptions): AssetRef {
  const asset = localizeCatalogAsset(ref.type, getAsset(ref.type, ref.id, options.catalog), options.locale ?? "en", options.catalog);
  return { ...ref, label: "title" in asset && asset.title ? asset.title : asset.name };
}

export function deriveImplementationTasks(proposal: Proposal, impactedAssets: AssetRef[], options: DerivedViewOptions): string[] {
  const locale = options.locale ?? "en";
  const specificationTasks = proposal.specChanges.map((change) => locale === "zh"
    ? `实施提案规格变更：${change}`
    : `Implement proposal specification change: ${change}`);
  const assetTasks = impactedAssets.map((ref) => locale === "zh"
    ? `更新受影响的${assetLabel(ref.type, locale)}：${ref.label}（${ref.type}/${ref.id}），并保持技术契约标识不变。`
    : `Update impacted ${assetLabel(ref.type, locale)}: ${ref.label} (${ref.type}/${ref.id}) while preserving technical contract identifiers.`);
  const rolloutTask = locale === "zh"
    ? `执行发布计划：${proposal.rolloutPlan}`
    : `Execute rollout plan: ${proposal.rolloutPlan}`;
  const rollbackTask = proposal.rollbackPlan
    ? locale === "zh"
      ? `准备回滚路径：${proposal.rollbackPlan}`
      : `Prepare rollback path: ${proposal.rollbackPlan}`
    : undefined;

  return [...specificationTasks, ...assetTasks, rolloutTask, rollbackTask].filter((task): task is string => Boolean(task));
}

export async function analyzeProposalImpact(proposalId: string, options: DerivedViewOptions = {}): Promise<ImpactAnalysis> {
  const locale = options.locale ?? "en";
  const proposal = getAsset<Proposal>("proposal", proposalId, options.catalog);
  const localizedProposal = localizeCatalogAsset("proposal", proposal, locale, options.catalog);
  const impactedAssets = proposal.impactedAssets.map((ref) => localizedRef(ref, options));
  const governanceResults = (await Promise.all(
    proposal.impactedAssets.map((asset) => runGovernanceChecks(asset.type, asset.id, options))
  )).flat();
  const affectedDomains = Array.from(
    new Set(
      proposal.impactedAssets
        .map((asset) => {
          const record = getAsset(asset.type, asset.id, options.catalog) as { domainId?: string };
          return getDomainName(record.domainId, options.catalog, locale);
        })
        .filter(Boolean)
    )
  );
  const riskLevel = proposal.risks.some((risk) => /high|高风险/i.test(risk)) ? "high" : proposal.impactedAssets.length > 5 ? "medium" : "low";
  const requiredContextPack = proposal.impactedAssets.some((asset) => asset.type === "api" || asset.type === "event");

  return {
    proposalId,
    impactedAssetCount: proposal.impactedAssets.length,
    impactedAssets,
    affectedDomains,
    riskLevel,
    requiredContextPack,
    governanceWarnings: governanceResults.filter((result) => result.status === "fail"),
    implementationTasks: deriveImplementationTasks(localizedProposal, impactedAssets, options)
  };
}
