"use client";

import { useState } from "react";
import { Badge, Card } from "../ui";
import { T } from "../language-provider";

type JsonRecord = Record<string, unknown>;
export function AssessmentReport({ data }: { data: JsonRecord }) {
  const [role, setRole] = useState<"product" | "architecture" | "agent">("product");
  const assessment = (data.assessment ?? {}) as JsonRecord;
  const estimate = (assessment.aiEstimate ?? {}) as JsonRecord;
  const snapshot = (data.snapshot ?? {}) as JsonRecord;
  const roleKey = role === "product" ? "assessment.roleProduct" : role === "architecture" ? "assessment.roleArchitecture" : "assessment.roleAgent";
  return <div className="space-y-5">
    <div className="flex flex-wrap gap-2">{(["product", "architecture", "agent"] as const).map((item) => <button className={role === item ? "rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white" : "rounded-md border border-border px-3 py-1.5 text-sm text-muted"} key={item} onClick={() => setRole(item)}><T k={item === "product" ? "assessment.roleProduct" : item === "architecture" ? "assessment.roleArchitecture" : "assessment.roleAgent"} /></button>)}</div>
    <div className="grid gap-4 md:grid-cols-4"><Metric label="assessment.verdict" value={String(assessment.verdict ?? (data.run as JsonRecord | null)?.status ?? "-")} /><Metric label="assessment.coverage" value={`${Math.round(Number(assessment.evidenceCoverage ?? 0) * 100)}%`} /><Metric label="assessment.tokenRange" value={formatRange(estimate.planningRange)} /><Metric label="assessment.evidence" value={String(snapshot.id ?? "-")} /></div>
    <Card><h2 className="mb-3 text-base font-semibold"><T k={roleKey as never} /></h2><div className="grid gap-4 md:grid-cols-2"><section><h3 className="mb-2 text-sm font-semibold"><T k="assessment.assumptions" /></h3><JsonList value={assessment.assumptions} /></section><section><h3 className="mb-2 text-sm font-semibold"><T k="assessment.unknowns" /></h3><JsonList value={assessment.unknowns} /></section></div></Card>
    <Card><h2 className="mb-3 text-base font-semibold"><T k="assessment.impact" /></h2><JsonList value={assessment.impactedFacts} /></Card>
    <p className="text-xs text-muted"><T k="assessment.heuristic" /></p>
  </div>;
}

function Metric({ label, value }: { label: "assessment.verdict" | "assessment.coverage" | "assessment.tokenRange" | "assessment.evidence"; value: string }) { return <Card><div className="text-xs font-semibold uppercase tracking-wide text-muted"><T k={label} /></div><div className="mt-2 truncate font-mono text-sm font-bold text-slate-800">{value}</div></Card>; }
function JsonList({ value }: { value: unknown }) { const values = Array.isArray(value) ? value : []; return values.length ? <ul className="space-y-2 text-sm text-slate-700">{values.slice(0, 12).map((item, index) => <li className="rounded-md bg-surface px-3 py-2" key={index}>{typeof item === "string" ? item : typeof item === "object" && item !== null && "en" in item ? String((item as { en: unknown }).en) : JSON.stringify(item)}</li>)}</ul> : <p className="text-sm text-muted">-</p>; }
function formatRange(value: unknown) { const range = value as { min?: number; max?: number } | null; return range?.min && range?.max ? `${range.min.toLocaleString()}–${range.max.toLocaleString()}` : "-"; }
