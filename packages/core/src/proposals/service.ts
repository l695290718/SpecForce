import { assetRefFromInput } from "../assets/service";
import { getAsset, getStore } from "../repository";
import type { Adr, AssetRef, Proposal } from "../types";

export interface AssetRefInput {
  assetType: string;
  assetId: string;
}

export interface CreateProposalInput {
  title: string;
  description: string;
  background?: string;
  goal: string;
  nonGoal?: string;
  scope?: string;
  impactedAssets?: AssetRefInput[];
  risks?: string;
  rolloutPlan?: string;
  rollbackPlan?: string;
}

export interface UpdateProposalInput {
  proposalId: string;
  patch: Record<string, unknown>;
}

export interface CreateAdrInput {
  title: string;
  status?: Adr["status"];
  context: string;
  decision: string;
  alternatives?: string;
  consequences?: string;
  constraints?: string;
  relatedAssets?: AssetRefInput[];
  owner?: string;
}

export interface LinkAssetsInput {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relationType: string;
  description?: string;
}

export interface AssetLinkResult {
  source: AssetRef;
  target: AssetRef;
  relationType: string;
  description?: string;
}

let proposalSequence = 1;
let adrSequence = 1;
const assetLinks: AssetLinkResult[] = [];

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return slug || "design-change";
}

function splitList(value?: string): string[] {
  return value
    ? value
        .split(/\n|;/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

export async function createProposal(input: CreateProposalInput): Promise<Proposal> {
  const now = new Date().toISOString();
  const id = `proposal-${slugify(input.title)}-${proposalSequence++}`;
  const impactedAssets = (input.impactedAssets ?? []).map((asset) => assetRefFromInput(asset.assetType, asset.assetId));
  const proposal: Proposal = {
    id,
    name: input.title,
    title: input.title,
    description: input.description,
    background: input.background ?? input.description,
    goal: input.goal,
    nonGoal: input.nonGoal ?? "Not specified.",
    scope: input.scope ?? "To be refined during design review.",
    impactedAssets,
    specChanges: [],
    risks: splitList(input.risks),
    rolloutPlan: input.rolloutPlan ?? "Roll out behind a guarded release process.",
    rollbackPlan: input.rollbackPlan,
    status: "draft",
    createdAt: now,
    updatedAt: now
  };
  getStore().proposals.push(proposal);
  return proposal;
}

export async function updateProposal(input: UpdateProposalInput): Promise<Proposal> {
  const proposal = getAsset<Proposal>("proposal", input.proposalId);
  const allowed = ["title", "description", "background", "goal", "nonGoal", "scope", "specChanges", "risks", "rolloutPlan", "rollbackPlan", "status"] as const;
  for (const key of allowed) {
    if (key in input.patch) {
      (proposal as unknown as Record<string, unknown>)[key] = input.patch[key];
    }
  }
  proposal.name = proposal.title;
  proposal.updatedAt = new Date().toISOString();
  return proposal;
}

export async function createAdr(input: CreateAdrInput): Promise<Adr> {
  const now = new Date().toISOString();
  const adr: Adr = {
    id: `adr-${slugify(input.title)}-${adrSequence++}`,
    name: input.title,
    title: input.title,
    description: input.decision,
    status: input.status ?? "proposed",
    context: input.context,
    decision: input.decision,
    alternatives: splitList(input.alternatives),
    consequences: splitList(input.consequences),
    constraints: splitList(input.constraints),
    relatedAssets: (input.relatedAssets ?? []).map((asset) => assetRefFromInput(asset.assetType, asset.assetId)),
    owner: input.owner ?? "Architecture",
    createdAt: now,
    updatedAt: now
  };
  getStore().adrs.push(adr);
  return adr;
}

export async function linkAssets(input: LinkAssetsInput): Promise<AssetLinkResult> {
  const link = {
    source: assetRefFromInput(input.sourceType, input.sourceId),
    target: assetRefFromInput(input.targetType, input.targetId),
    relationType: input.relationType,
    description: input.description
  };
  assetLinks.push(link);
  return link;
}

export function listAssetLinks(): AssetLinkResult[] {
  return [...assetLinks];
}
