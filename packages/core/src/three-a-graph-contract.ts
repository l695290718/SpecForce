export const THREE_A_GRAPH_ANALYSIS_VERSION = "3a.graph-analysis.v1" as const;

export type ThreeAGraphSource = "ARCHITECTURE_UNIT_PROJECTION" | "GRAPH_ANALYSIS_PROJECTION";
export type ThreeAGraphFidelity = "UNIT" | "UNIT_WITH_MEMBERS" | "UNIT_WITH_MEMBERS_AND_RELATIONS" | "ASSERTION";
export type ThreeAGraphAnalysisAvailability = "READY" | "EMPTY" | "STALE" | "VERSION_MISMATCH" | "UNAVAILABLE";
