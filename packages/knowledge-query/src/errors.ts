export type ThreeAQueryErrorCode = "SCOPE_ACCESS_DENIED" | "BASELINE_NOT_FOUND" | "PROJECTION_MANIFEST_REQUIRED" | "PROJECTION_MANIFEST_NOT_FOUND" | "ARCHITECTURE_FACT_NOT_FOUND" | "ARCHITECTURE_UNIT_NOT_FOUND" | "NO_GOVERNED_ARCHITECTURE_UNITS" | "ARCHITECTURE_MAP_QUERY_INVALID" | "ARCHITECTURE_MAP_UNAVAILABLE" | "CURSOR_INVALID" | "RESULT_PARTIAL" | "QUERY_BUDGET_INVALID" | "QUERY_TIMEOUT";

export class ThreeAQueryError extends Error {
  readonly name = "ThreeAQueryError";
  constructor(readonly code: ThreeAQueryErrorCode, readonly details?: Record<string, unknown>) { super(code); }
}

export function asQueryError(error: unknown): ThreeAQueryError {
  if (error instanceof ThreeAQueryError) return error;
  return new ThreeAQueryError("CURSOR_INVALID");
}
