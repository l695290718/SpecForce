import { analyzeProposalImpact } from "../impact/analyze";
import { localizeAsset } from "../localization/assets";
import { findAsset, getAsset, localizeCatalogAsset } from "../repository";
import { renderAssetSummary } from "../summary/render";
import type { AssetLocale, AssetRef, ContextPack, DerivedViewOptions, Proposal } from "../types";

const sectionTitles = [
  "1. Feature Summary", "2. Business Background", "3. Goals", "4. Non-goals", "5. Impacted Assets",
  "6. Domain Model Context", "7. Data Model Context", "8. API Contracts", "9. Event Contracts", "10. Business Rules",
  "11. State Machines", "12. Architecture Decisions", "13. Quality Requirements", "14. Observability Requirements",
  "15. Implementation Tasks", "16. Test Suggestions", "17. Constraints and Do-not Rules"
];

const localizedSectionTitles = {
  en: sectionTitles,
  zh: [
    "1. 特性摘要", "2. 业务背景", "3. 目标", "4. 非目标", "5. 受影响资产", "6. 领域模型上下文",
    "7. 数据模型上下文", "8. API 契约", "9. 事件契约", "10. 业务规则", "11. 状态机", "12. 架构决策",
    "13. 质量要求", "14. 可观测性要求", "15. 实施任务", "16. 测试建议", "17. 约束和禁止事项"
  ]
} as const;

const testSuggestions = {
  en: ["Unit test refund amount boundary conditions.", "Contract test CreateRefund idempotency behavior.", "Event schema test for required envelope fields.", "State machine transition test for duplicate callbacks."],
  zh: ["单元测试退款金额边界条件。", "契约测试 CreateRefund 幂等行为。", "测试事件信封必填字段。", "测试重复回调时的状态机转换。"]
} as const;

const doNotRules = {
  en: ["Do not bypass refund amount validation.", "Do not introduce synchronous dependency from order domain to inventory domain.", "Do not expose raw database access or execute arbitrary code.", "Keep API and event changes backward compatible.", "Preserve idempotency for API calls and event consumption."],
  zh: ["不得绕过退款金额校验。", "不得引入订单域到库存域的同步依赖。", "不得暴露原始数据库访问或执行任意代码。", "API 和事件变更必须保持向后兼容。", "保持 API 调用与事件消费的幂等性。"]
} as const;

function refsOfType(refs: AssetRef[], types: string[]): AssetRef[] {
  return refs.filter((ref) => types.includes(ref.type));
}

async function summaries(refs: AssetRef[], options: DerivedViewOptions): Promise<string> {
  if (refs.length === 0) return options.locale === "zh" ? "- 当前范围内无资产。" : "- None in scope.";
  const rendered = await Promise.all(refs.map((ref) => renderAssetSummary(ref.type, ref.id, options)));
  return rendered.map((summary) => `- ${summary.replace(/\n/g, "\n  ")}`).join("\n");
}

export interface GenerateContextPackOptions extends DerivedViewOptions {
  targetAgent?: "codex" | "claude-code" | "cursor" | "copilot" | "generic" | string;
  includeAssets?: string[];
}

export async function generateContextPack(proposalId: string, options: GenerateContextPackOptions = {}): Promise<ContextPack> {
  const canonicalProposal = getAsset<Proposal>("proposal", proposalId, options.catalog);
  const includedAssets = options.includeAssets?.length
    ? canonicalProposal.impactedAssets.filter((asset) => options.includeAssets?.includes(asset.id))
    : canonicalProposal.impactedAssets;

  const renderLocale = async (locale: AssetLocale) => {
    const derivedOptions = { catalog: options.catalog, locale };
    const proposal = localizeCatalogAsset("proposal", canonicalProposal, locale, options.catalog);
    const impact = await analyzeProposalImpact(proposalId, derivedOptions);
    const titles = localizedSectionTitles[locale];
    const localizedIncludedAssets = includedAssets.map((ref) => {
      const asset = localizeCatalogAsset(ref.type, findAsset(ref, options.catalog), locale, options.catalog);
      return { ...ref, label: "title" in asset && asset.title ? asset.title : asset.name };
    });
    const markdown = [
      locale === "zh" ? "# Agent 上下文包" : "# Agent Context Pack", "",
      `## ${titles[0]}`, proposal.description, "",
      `## ${titles[1]}`, proposal.background, "",
      `## ${titles[2]}`, proposal.goal, "",
      `## ${titles[3]}`, proposal.nonGoal, "",
      `## ${titles[4]}`, localizedIncludedAssets.map((asset) => `- ${asset.label} (${asset.type}/${asset.id})`).join("\n"), "",
      `## ${titles[5]}`, await summaries(refsOfType(includedAssets, ["domain"]), derivedOptions), "",
      `## ${titles[6]}`, await summaries(refsOfType(includedAssets, ["dataModel"]), derivedOptions), "",
      `## ${titles[7]}`, await summaries(refsOfType(includedAssets, ["api"]), derivedOptions), "",
      `## ${titles[8]}`, await summaries(refsOfType(includedAssets, ["event"]), derivedOptions), "",
      `## ${titles[9]}`, await summaries(refsOfType(includedAssets, ["businessRule"]), derivedOptions), "",
      `## ${titles[10]}`, await summaries(refsOfType(includedAssets, ["stateMachine"]), derivedOptions), "",
      `## ${titles[11]}`, await summaries(refsOfType(includedAssets, ["adr"]), derivedOptions), "",
      `## ${titles[12]}`, await summaries(refsOfType(includedAssets, ["quality"]), derivedOptions), "",
      `## ${titles[13]}`, await summaries(refsOfType(includedAssets, ["observability"]), derivedOptions), "",
      `## ${titles[14]}`, ...impact.implementationTasks.map((task) => `- ${task}`), "",
      `## ${titles[15]}`, ...testSuggestions[locale].map((item) => `- ${item}`), "",
      `## ${titles[16]}`, ...doNotRules[locale].map((item) => `- ${item}`)
    ].join("\n");

    return { proposal, impact, includedAssets: localizedIncludedAssets, markdown };
  };

  const english = await renderLocale("en");
  const chinese = await renderLocale("zh");
  const chineseRisk = { low: "低", medium: "中", high: "高" }[chinese.impact.riskLevel];
  const pack: ContextPack = {
    id: `ctx-${canonicalProposal.id.replace(/^proposal-/, "")}`,
    name: `${english.proposal.title} Agent Context Pack`,
    proposalId,
    targetAgent: options.targetAgent ?? "codex",
    summary: `${english.proposal.title}: ${english.impact.impactedAssetCount} impacted assets, ${english.impact.riskLevel} risk.`,
    includedAssets: english.includedAssets,
    constraints: ["Backward-compatible contracts", "Idempotent writes", "Event-driven inventory integration"],
    instructions: english.impact.implementationTasks,
    generatedMarkdown: english.markdown,
    createdAt: new Date().toISOString(),
    localizedContent: {
      zh: {
        name: `${chinese.proposal.title} Agent 上下文包`,
        summary: `${chinese.proposal.title}：影响 ${chinese.impact.impactedAssetCount} 个资产，风险级别为${chineseRisk}。`,
        constraints: ["契约保持向后兼容", "写操作保持幂等", "库存集成采用事件驱动"],
        instructions: chinese.impact.implementationTasks,
        generatedMarkdown: chinese.markdown
      }
    }
  };

  const localized = localizeAsset("contextPack", pack, options.locale ?? "en");
  return options.locale === "zh" ? { ...localized, includedAssets: chinese.includedAssets } : localized;
}

export { sectionTitles };
