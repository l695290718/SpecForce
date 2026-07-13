import { getAsset, getDomainName, localizeCatalogAsset } from "../repository";
import { runGovernanceChecks } from "../rules/governance";
import type { AssetRef, DerivedViewOptions, ImpactAnalysis, Proposal } from "../types";

const implementationTasks = {
  en: [
    "Update Prisma/schema migration for refund persistence.",
    "Implement RefundEligibilityService with refundable amount calculation.",
    "Expose CreateRefund API with auth, idempotency, and error-code handling.",
    "Publish RefundCreated and RefundSucceeded events with standard envelope fields.",
    "Wire payment refund integration with retry, fallback, and circuit-breaker policy.",
    "Add dashboards and alerts for refund success rate and retry spikes."
  ],
  zh: [
    "更新退款持久化所需的 Prisma/schema 迁移。",
    "实现 RefundEligibilityService 及可退款金额计算。",
    "提供 CreateRefund API，并处理认证、幂等和错误码。",
    "发布带标准信封字段的 RefundCreated 与 RefundSucceeded 事件。",
    "接入支付退款集成，并配置重试、降级和熔断策略。",
    "增加退款成功率和重试峰值的仪表盘与告警。"
  ]
} as const;

function localizedRef(ref: AssetRef, options: DerivedViewOptions): AssetRef {
  const asset = localizeCatalogAsset(ref.type, getAsset(ref.type, ref.id, options.catalog), options.locale ?? "en", options.catalog);
  return { ...ref, label: "title" in asset && asset.title ? asset.title : asset.name };
}

export async function analyzeProposalImpact(proposalId: string, options: DerivedViewOptions = {}): Promise<ImpactAnalysis> {
  const locale = options.locale ?? "en";
  const proposal = getAsset<Proposal>("proposal", proposalId, options.catalog);
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
    impactedAssets: proposal.impactedAssets.map((ref) => localizedRef(ref, options)),
    affectedDomains,
    riskLevel,
    requiredContextPack,
    governanceWarnings: governanceResults.filter((result) => result.status === "fail"),
    implementationTasks: [...implementationTasks[locale]]
  };
}
