import { Badge } from "../ui";
import React from "react";
import type { FeatureGovernanceState } from "@specforge/core";

export function FeatureStatus({ lifecycle, governance, locale }: { lifecycle: string; governance: FeatureGovernanceState; locale: "zh" | "en" }) {
  const labels = locale === "zh" ? { lifecycle: "生命周期", coverage: "覆盖", evidence: "证据", consistency: "一致性" } : { lifecycle: "Lifecycle", coverage: "Coverage", evidence: "Evidence", consistency: "Consistency" };
  return <div className="flex flex-wrap gap-2" aria-label={locale === "zh" ? "特性治理状态" : "Feature governance status"}>
    <Badge tone="blue">{labels.lifecycle}: {lifecycle}</Badge>
    <Badge tone={governance.coverageStatus === "COMPLETE" ? "green" : "amber"}>{labels.coverage}: {governance.coverageStatus}</Badge>
    <Badge tone={governance.evidenceStatus === "VERIFIED" ? "green" : "neutral"}>{labels.evidence}: {governance.evidenceStatus}</Badge>
    <Badge tone={governance.consistencyStatus === "DRIFTED" ? "red" : governance.consistencyStatus === "CONSISTENT" ? "green" : "neutral"}>{labels.consistency}: {governance.consistencyStatus}</Badge>
  </div>;
}
