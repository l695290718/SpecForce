import { analyzeProposalImpact } from "../impact/analyze";
import type { TransitiveProposalImpact } from "../impact/evaluate";
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

function refsOfType(refs: AssetRef[], types: string[]): AssetRef[] {
  return refs.filter((ref) => types.includes(ref.type));
}

function deriveTestSuggestions(proposal: Proposal, refs: AssetRef[], locale: AssetLocale, options: DerivedViewOptions): string[] {
  const assetSuggestions = refs.map((ref) => {
    const asset = localizeCatalogAsset(ref.type, findAsset(ref, options.catalog), locale, options.catalog);
    const label = "title" in asset && asset.title ? asset.title : asset.name;

    if (ref.type === "api" && "method" in asset && "path" in asset) {
      return locale === "zh"
        ? `为${label}增加契约测试（${asset.method} ${asset.path}），覆盖声明的请求、响应、错误、兼容性和幂等要求。`
        : `Add contract tests for ${label} (${asset.method} ${asset.path}), covering declared request, response, errors, compatibility, and idempotency requirements.`;
    }
    if (ref.type === "event") {
      return locale === "zh"
        ? `为${label}增加事件 schema、兼容性、幂等消费和失败处理测试。`
        : `Add event schema, compatibility, idempotent-consumption, and failure-handling tests for ${label}.`;
    }
    if (ref.type === "stateMachine") {
      return locale === "zh"
        ? `为${label}增加状态转换、守卫、重复触发和失败处理测试。`
        : `Add transition, guard, duplicate-trigger, and failure-handling tests for ${label}.`;
    }
    if (ref.type === "businessRule") {
      return locale === "zh" ? `为${label}增加正例、反例和边界条件测试。` : `Add positive, negative, and boundary-condition tests for ${label}.`;
    }
    return locale === "zh" ? `为${label}增加覆盖其声明约束的验证测试。` : `Add verification tests for the declared constraints of ${label}.`;
  });
  const acceptance = locale === "zh"
    ? `增加验收测试以验证提案目标：${proposal.goal}`
    : `Add acceptance tests for proposal goal: ${proposal.goal}`;
  return [acceptance, ...assetSuggestions];
}

function deriveConstraints(proposal: Proposal, locale: AssetLocale): string[] {
  return locale === "zh"
    ? [
        `遵守提案范围：${proposal.scope}`,
        `保持非目标边界：${proposal.nonGoal}`,
        "保持所含资产的技术标识和契约兼容性。"
      ]
    : [
        `Honor proposal scope: ${proposal.scope}`,
        `Preserve non-goal boundary: ${proposal.nonGoal}`,
        "Preserve technical identifiers and contract compatibility for included assets."
      ];
}

function deriveDoNotRules(proposal: Proposal, locale: AssetLocale): string[] {
  return locale === "zh"
    ? [
        `不得扩展到声明范围之外：${proposal.scope}`,
        `不得违反非目标：${proposal.nonGoal}`,
        "不得更改资产 ID、API path、event topic、schema key、状态码或关系码。",
        "不得绕过提案和受影响资产中声明的业务规则、验证或兼容性约束。"
      ]
    : [
        `Do not expand beyond the declared scope: ${proposal.scope}`,
        `Do not violate the non-goal: ${proposal.nonGoal}`,
        "Do not change asset IDs, API paths, event topics, schema keys, state codes, or relation codes.",
        "Do not bypass business rules, validation, or compatibility constraints declared by the proposal and impacted assets."
      ];
}

async function summaries(refs: AssetRef[], options: DerivedViewOptions): Promise<string> {
  if (refs.length === 0) return options.locale === "zh" ? "- 当前范围内无资产。" : "- None in scope.";
  const rendered = await Promise.all(refs.map((ref) => renderAssetSummary(ref.type, ref.id, options)));
  return rendered.map((summary) => `- ${summary.replace(/\n/g, "\n  ")}`).join("\n");
}

export interface GenerateContextPackOptions extends DerivedViewOptions {
  targetAgent?: "codex" | "claude-code" | "cursor" | "copilot" | "generic" | string;
  includeAssets?: string[];
  transitiveImpact?: Pick<TransitiveProposalImpact, "impactedAssets">;
}

export async function generateContextPack(proposalId: string, options: GenerateContextPackOptions = {}): Promise<ContextPack> {
  const canonicalProposal = getAsset<Proposal>("proposal", proposalId, options.catalog);
  const impactAssets = options.transitiveImpact?.impactedAssets ?? canonicalProposal.impactedAssets;
  const includedAssets = options.includeAssets?.length
    ? impactAssets.filter((asset) => options.includeAssets?.includes(asset.id))
    : impactAssets;

  const renderLocale = async (locale: AssetLocale) => {
    const derivedOptions = { catalog: options.catalog, locale };
    const proposal = localizeCatalogAsset("proposal", canonicalProposal, locale, options.catalog);
    const impact = await analyzeProposalImpact(proposalId, derivedOptions);
    const titles = localizedSectionTitles[locale];
    const localizedIncludedAssets = includedAssets.map((ref) => {
      const asset = localizeCatalogAsset(ref.type, findAsset(ref, options.catalog), locale, options.catalog);
      return { ...ref, label: "title" in asset && asset.title ? asset.title : asset.name };
    });
    const testSuggestions = deriveTestSuggestions(proposal, includedAssets, locale, derivedOptions);
    const constraints = deriveConstraints(proposal, locale);
    const doNotRules = deriveDoNotRules(proposal, locale);
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
      `## ${titles[15]}`, ...testSuggestions.map((item) => `- ${item}`), "",
      `## ${titles[16]}`, ...doNotRules.map((item) => `- ${item}`)
    ].join("\n");

    return { proposal, impact, includedAssets: localizedIncludedAssets, constraints, markdown };
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
    constraints: english.constraints,
    instructions: english.impact.implementationTasks,
    generatedMarkdown: english.markdown,
    createdAt: new Date().toISOString(),
    localizedContent: {
      zh: {
        name: `${chinese.proposal.title} Agent 上下文包`,
        summary: `${chinese.proposal.title}：影响 ${chinese.impact.impactedAssetCount} 个资产，风险级别为${chineseRisk}。`,
        constraints: chinese.constraints,
        instructions: chinese.impact.implementationTasks,
        generatedMarkdown: chinese.markdown
      }
    }
  };

  const localized = localizeAsset("contextPack", pack, options.locale ?? "en");
  return options.locale === "zh" ? { ...localized, includedAssets: chinese.includedAssets } : localized;
}

export { sectionTitles };
