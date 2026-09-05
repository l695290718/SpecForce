import { analyzeProposalImpact } from "../impact/analyze";
import { deriveTransitiveImpactSummary, type TransitiveProposalImpact } from "../impact/evaluate";
import { localizeAsset } from "../localization/assets";
import { findAsset, getAsset, localizeCatalogAsset } from "../repository";
import { renderAssetSummary } from "../summary/render";
import type { AssetLocale, AssetRef, ContextPack, DerivedViewOptions, Proposal } from "../types";

const sectionTitles = [
  "1. Service Features", "2. Functional Features", "3. Feature Summary", "4. Business Background", "5. Goals", "6. Non-goals", "7. Impacted Assets",
  "8. Domain Model Context", "9. Data Model Context", "10. API Contracts", "11. Event Contracts", "12. Business Rules",
  "13. State Machines", "14. Architecture Decisions", "15. Quality Requirements", "16. Observability Requirements",
  "17. Implementation Tasks", "18. Test Suggestions", "19. Constraints and Do-not Rules"
];

const localizedSectionTitles = {
  en: sectionTitles,
  zh: [
    "1. 服务特性", "2. 功能特性", "3. 特性摘要", "4. 业务背景", "5. 目标", "6. 非目标", "7. 受影响资产", "8. 领域模型上下文",
    "9. 数据模型上下文", "10. API 契约", "11. 事件契约", "12. 业务规则", "13. 状态机", "14. 架构决策",
    "15. 质量要求", "16. 可观测性要求", "17. 实施任务", "18. 测试建议", "19. 约束和禁止事项"
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
  transitiveImpact?: Pick<TransitiveProposalImpact, "impactedAssets" | "nodes">;
}

export async function generateContextPack(proposalId: string, options: GenerateContextPackOptions = {}): Promise<ContextPack> {
  const canonicalProposal = getAsset<Proposal>("proposal", proposalId, options.catalog);
  const renderLocale = async (locale: AssetLocale) => {
    const derivedOptions = { catalog: options.catalog, locale };
    const proposal = localizeCatalogAsset("proposal", canonicalProposal, locale, options.catalog);
    const impact = options.transitiveImpact
      ? await deriveTransitiveImpactSummary(canonicalProposal, options.transitiveImpact.nodes, derivedOptions)
      : await analyzeProposalImpact(proposalId, derivedOptions);
    const includedAssets = options.includeAssets?.length
      ? impact.impactedAssets.filter((asset) => options.includeAssets?.includes(asset.id))
      : impact.impactedAssets;
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
      `## ${titles[0]}`, await summaries(refsOfType(includedAssets, ["serviceFeature"]), derivedOptions), "",
      `## ${titles[1]}`, await summaries(refsOfType(includedAssets, ["functionalFeature"]), derivedOptions), "",
      `## ${titles[2]}`, proposal.description, "",
      `## ${titles[3]}`, proposal.background, "",
      `## ${titles[4]}`, proposal.goal, "",
      `## ${titles[5]}`, proposal.nonGoal, "",
      `## ${titles[6]}`, localizedIncludedAssets.map((asset) => `- ${asset.label} (${asset.type}/${asset.id})`).join("\n"), "",
      `## ${titles[7]}`, await summaries(refsOfType(includedAssets, ["domain"]), derivedOptions), "",
      `## ${titles[8]}`, await summaries(refsOfType(includedAssets, ["dataModel"]), derivedOptions), "",
      `## ${titles[9]}`, await summaries(refsOfType(includedAssets, ["api"]), derivedOptions), "",
      `## ${titles[10]}`, await summaries(refsOfType(includedAssets, ["event"]), derivedOptions), "",
      `## ${titles[11]}`, await summaries(refsOfType(includedAssets, ["businessRule"]), derivedOptions), "",
      `## ${titles[12]}`, await summaries(refsOfType(includedAssets, ["stateMachine"]), derivedOptions), "",
      `## ${titles[13]}`, await summaries(refsOfType(includedAssets, ["adr"]), derivedOptions), "",
      `## ${titles[14]}`, await summaries(refsOfType(includedAssets, ["quality"]), derivedOptions), "",
      `## ${titles[15]}`, await summaries(refsOfType(includedAssets, ["observability"]), derivedOptions), "",
      `## ${titles[16]}`, ...impact.implementationTasks.map((task) => `- ${task}`), "",
      `## ${titles[17]}`, ...testSuggestions.map((item) => `- ${item}`), "",
      `## ${titles[18]}`, ...doNotRules.map((item) => `- ${item}`)
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
