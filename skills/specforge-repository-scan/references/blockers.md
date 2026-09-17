# Blockers

- `SCAN_SCOPE_REQUIRED` or `SCAN_SCOPE_PATH_REQUIRED`: provide the exact application-service ID and Scope path; never infer either from the repository or UI.
- `SCAN_RESUME_CONTEXT_MISMATCH`: restart with the same repository snapshot, effective policy digest, extractor catalog, and technology profile, or open a new scan session.
- `REQUIRED_EXTRACTOR_MISSING:*`: install or authorize the signed scanner release that covers the detected framework, then retry.
- `COVERAGE_GAP:*`: inspect the bounded report, add a safe include/exclude or framework hint only when evidence supports it, then retry. Do not suppress the gap by marking a family complete.
- `SEMANTIC_CANDIDATE_COVERAGE_INCOMPLETE`: continue ordered candidate batches or close the scan as blocked.
- `KNOWLEDGE_RECEIPT_STALE`: rerun system-knowledge readiness and consume a new bounded receipt before continuing.
- Any MCP write failure: record `MCP synchronization blocked`, the exact error and retry trigger in the repository design record; do not claim completion.
