import type { FeatureDetail as FeatureDetailModel } from "../../lib/features";
import React from "react";
import { FeatureStatus } from "./feature-status";

export function FeatureDetail({ feature, locale }: { feature: FeatureDetailModel; locale: "zh" | "en" }) {
  const asset = feature.asset;
  const primaryDetails = "scenario" in asset
    ? [{ label: copyFor(locale).scenario, value: asset.scenario }, { label: copyFor(locale).outcome, value: asset.valueOutcome }]
    : [{ label: copyFor(locale).trigger, value: asset.trigger }, { label: copyFor(locale).behavior, value: asset.observableBehavior }];
  const copy = locale === "zh" ? { title: "特性详情", criteria: "验收标准", relations: "有类型关系", reasons: "治理原因", none: "暂无", canonical: "规范 ID", scenario: "场景", outcome: "价值结果", trigger: "触发条件", behavior: "可观测行为" } : { title: "Feature detail", criteria: "Acceptance criteria", relations: "Typed relationships", reasons: "Governance reasons", none: "None", canonical: "Canonical ID", scenario: "Scenario", outcome: "Value outcome", trigger: "Trigger", behavior: "Observable behavior" };
  return <aside className="space-y-5 border-l border-border pl-5"><div><div className="text-xs font-semibold uppercase text-muted">{copy.title}</div><h2 className="mt-1 text-xl font-semibold text-ink">{feature.name}</h2><div className="mt-1 break-all font-mono text-xs text-muted">{copy.canonical}: {feature.id}</div></div><FeatureStatus governance={feature.governance} lifecycle={feature.lifecycleStatus} locale={locale} /><p className="text-sm leading-relaxed text-slate-600">{feature.summary}</p>
    {primaryDetails.map((detail) => <Detail key={detail.label} label={detail.label} value={detail.value} />)}
    <List title={copy.criteria} values={asset.acceptanceCriteria} empty={copy.none} />
    <div><h3 className="text-sm font-semibold">{copy.relations}</h3><div className="mt-2 space-y-2">{feature.relationships.length ? feature.relationships.map((relation) => <div className="border-l-2 border-indigo-300 pl-3 text-sm" key={relation.id}><div className="font-mono text-xs text-indigo-700">{relation.direction === "incoming" ? "←" : "→"} {relation.relationType}</div><div className="mt-0.5 text-slate-700">{relation.oppositeLabel}</div><div className="truncate font-mono text-[11px] text-muted" title={relation.oppositeId}>{relation.oppositeId}</div></div>) : <p className="text-sm text-muted">{copy.none}</p>}</div></div>
    <List title={copy.reasons} values={feature.governance.reasons} empty={copy.none} />
  </aside>;
}
function copyFor(locale: "zh" | "en") { return locale === "zh" ? { scenario: "场景", outcome: "价值结果", trigger: "触发条件", behavior: "可观测行为" } : { scenario: "Scenario", outcome: "Value outcome", trigger: "Trigger", behavior: "Observable behavior" }; }
function Detail({ label, value }: { label: string; value: string }) { return <div><h3 className="text-sm font-semibold">{label}</h3><p className="mt-1 text-sm leading-relaxed text-slate-600">{value}</p></div>; }
function List({ title, values, empty }: { title: string; values: readonly string[]; empty: string }) { return <div><h3 className="text-sm font-semibold">{title}</h3>{values.length ? <ul className="mt-2 space-y-1 text-sm text-slate-600">{values.map((value) => <li className="flex gap-2" key={value}><span className="text-indigo-500">•</span><span>{value}</span></li>)}</ul> : <p className="mt-1 text-sm text-muted">{empty}</p>}</div>; }
