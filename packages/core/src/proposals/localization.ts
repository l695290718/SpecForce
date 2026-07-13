import { localizeAsset } from "../localization/assets";
import type { AssetLocale, Proposal } from "../types";

export type ProposalLocale = AssetLocale;

export function localizeProposal(proposal: Proposal, locale: ProposalLocale): Proposal {
  return localizeAsset("proposal", proposal, locale);
}
