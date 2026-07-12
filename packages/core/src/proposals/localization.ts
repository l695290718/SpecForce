import type { Proposal } from "../types";

export type ProposalLocale = "zh" | "en";

export function localizeProposal(proposal: Proposal, locale: ProposalLocale): Proposal {
  const localized = proposal.localizedContent?.[locale];
  if (!localized) return proposal;

  return {
    ...proposal,
    ...localized,
    specChanges: localized.specChanges ?? proposal.specChanges,
    risks: localized.risks ?? proposal.risks
  };
}
