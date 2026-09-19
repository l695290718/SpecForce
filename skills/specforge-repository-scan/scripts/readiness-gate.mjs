const BOOTSTRAP_REASONS = new Set([
  "KNOWLEDGE_SOURCE_NOT_CONFIGURED",
  "KNOWLEDGE_COVERAGE_INCOMPLETE",
  "KNOWLEDGE_PENDING_PROMOTION"
]);

export function classifyReadiness(result, exactScopeWriteAuthorized) {
  const reasonCodes = new Set(result?.reasonCodes ?? []);
  if (result?.trustStatus === "SELF_CONTAINED" && exactScopeWriteAuthorized) return { mode: "READ", reasonCodes: [...reasonCodes] };
  const onlyBootstrapReasons = [...reasonCodes].every((reason) => BOOTSTRAP_REASONS.has(reason));
  if (exactScopeWriteAuthorized && (result?.remediationActions ?? []).includes("START_FULL_SCAN") && onlyBootstrapReasons) {
    return { mode: "BOOTSTRAP_SCAN", reasonCodes: [...reasonCodes] };
  }
  return { mode: "BLOCKED", reasonCodes: [...reasonCodes] };
}
