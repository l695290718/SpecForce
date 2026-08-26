export function invalidationReason(input: {
  snapshotDigest: string;
  currentDigest: string;
  reconciliationStatus: string;
  briefSuperseded: boolean;
}): string | null {
  if (input.briefSuperseded) return "BRIEF_SUPERSEDED";
  if (input.snapshotDigest !== input.currentDigest) return "EVIDENCE_SNAPSHOT_CHANGED";
  if (["BLOCKED", "DRIFTED", "PENDING"].includes(input.reconciliationStatus.toUpperCase())) {
    return "RECONCILIATION_NOT_CONVERGED";
  }
  return null;
}
