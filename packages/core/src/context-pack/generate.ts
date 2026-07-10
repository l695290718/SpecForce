import { assetLabel, findAsset, getAsset } from "../repository";
import { analyzeProposalImpact } from "../impact/analyze";
import { renderAssetSummary } from "../summary/render";
import type { AssetRef, ContextPack, Proposal } from "../types";

const sectionTitles = [
  "1. Feature Summary",
  "2. Business Background",
  "3. Goals",
  "4. Non-goals",
  "5. Impacted Assets",
  "6. Domain Model Context",
  "7. Data Model Context",
  "8. API Contracts",
  "9. Event Contracts",
  "10. Business Rules",
  "11. State Machines",
  "12. Architecture Decisions",
  "13. Quality Requirements",
  "14. Observability Requirements",
  "15. Implementation Tasks",
  "16. Test Suggestions",
  "17. Constraints and Do-not Rules"
];

function refsOfType(refs: AssetRef[], types: string[]): AssetRef[] {
  return refs.filter((ref) => types.includes(ref.type));
}

async function summaries(refs: AssetRef[]): Promise<string> {
  if (refs.length === 0) return "- None in scope.";
  const rendered = await Promise.all(refs.map((ref) => renderAssetSummary(ref.type, ref.id)));
  return rendered.map((summary) => `- ${summary.replace(/\n/g, "\n  ")}`).join("\n");
}

export interface GenerateContextPackOptions {
  targetAgent?: "codex" | "claude-code" | "cursor" | "copilot" | "generic" | string;
  includeAssets?: string[];
}

export async function generateContextPack(proposalId: string, options: GenerateContextPackOptions = {}): Promise<ContextPack> {
  const proposal = getAsset<Proposal>("proposal", proposalId);
  const impact = await analyzeProposalImpact(proposalId);
  const includedAssets = options.includeAssets?.length ? proposal.impactedAssets.filter((asset) => options.includeAssets?.includes(asset.id)) : proposal.impactedAssets;
  const markdown = [
    "# Agent Context Pack",
    "",
    `## ${sectionTitles[0]}`,
    proposal.description,
    "",
    `## ${sectionTitles[1]}`,
    proposal.background,
    "",
    `## ${sectionTitles[2]}`,
    proposal.goal,
    "",
    `## ${sectionTitles[3]}`,
    proposal.nonGoal,
    "",
    `## ${sectionTitles[4]}`,
    includedAssets.map((asset) => `- ${asset.label} (${asset.type}/${asset.id})`).join("\n"),
    "",
    `## ${sectionTitles[5]}`,
    await summaries(refsOfType(includedAssets, ["domain"])),
    "",
    `## ${sectionTitles[6]}`,
    await summaries(refsOfType(includedAssets, ["dataModel"])),
    "",
    `## ${sectionTitles[7]}`,
    await summaries(refsOfType(includedAssets, ["api"])),
    "",
    `## ${sectionTitles[8]}`,
    await summaries(refsOfType(includedAssets, ["event"])),
    "",
    `## ${sectionTitles[9]}`,
    await summaries(refsOfType(includedAssets, ["businessRule"])),
    "",
    `## ${sectionTitles[10]}`,
    await summaries(refsOfType(includedAssets, ["stateMachine"])),
    "",
    `## ${sectionTitles[11]}`,
    await summaries(refsOfType(includedAssets, ["adr"])),
    "",
    `## ${sectionTitles[12]}`,
    await summaries(refsOfType(includedAssets, ["quality"])),
    "",
    `## ${sectionTitles[13]}`,
    await summaries(refsOfType(includedAssets, ["observability"])),
    "",
    `## ${sectionTitles[14]}`,
    impact.implementationTasks.map((task) => `- ${task}`).join("\n"),
    "",
    `## ${sectionTitles[15]}`,
    "- Unit test refund amount boundary conditions.",
    "- Contract test CreateRefund idempotency behavior.",
    "- Event schema test for required envelope fields.",
    "- State machine transition test for duplicate callbacks.",
    "",
    `## ${sectionTitles[16]}`,
    "- Do not bypass refund amount validation.",
    "- Do not introduce synchronous dependency from order domain to inventory domain.",
    "- Do not expose raw database access or execute arbitrary code.",
    "- Keep API and event changes backward compatible.",
    "- Preserve idempotency for API calls and event consumption."
  ].join("\n");

  return {
    id: `ctx-${proposal.id.replace(/^proposal-/, "")}`,
    name: `${proposal.title} Agent Context Pack`,
    proposalId,
    targetAgent: options.targetAgent ?? "codex",
    summary: `${proposal.title}: ${impact.impactedAssetCount} impacted assets, ${impact.riskLevel} risk.`,
    includedAssets: includedAssets.map((ref) => ({ ...ref, label: findAsset(ref).name ?? ref.label })),
    constraints: ["Backward-compatible contracts", "Idempotent writes", "Event-driven inventory integration"],
    instructions: impact.implementationTasks,
    generatedMarkdown: markdown,
    createdAt: new Date().toISOString()
  };
}

export { sectionTitles, assetLabel };
