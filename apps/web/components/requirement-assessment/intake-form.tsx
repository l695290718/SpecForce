"use client";

import { useState } from "react";
import { useLanguage, T } from "../language-provider";

export function AssessmentIntakeForm({ scope }: { scope: string }) {
  const { locale } = useLanguage();
  const [requirementId, setRequirementId] = useState("");
  const [intentEn, setIntentEn] = useState("");
  const [intentZh, setIntentZh] = useState("");
  const [state, setState] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scope) { setState(locale === "zh" ? "请选择应用服务 Scope。" : "Select an application-service Scope first."); return; }
    setBusy(true); setState(null);
    try {
      const response = await fetch("/api/requirement-assessments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope, requirementId, revision: 1, intent: { en: intentEn, zh: intentZh }, idempotencyKey: `${requirementId}:1:${intentEn}` }) });
      const body = await response.json() as { runId?: string; code?: string };
      setState(response.ok ? `${body.runId ?? ""} ${locale === "zh" ? "已进入队列" : "queued"}` : body.code ?? "REQUEST_FAILED");
      if (response.ok) { setRequirementId(""); setIntentEn(""); setIntentZh(""); }
    } catch { setState("REQUEST_FAILED"); } finally { setBusy(false); }
  }
  return <form className="grid gap-3" onSubmit={submit}>
    <label className="grid gap-1 text-sm font-semibold text-slate-700"><T k="assessment.requirementId" /><input className="h-10 rounded-md border border-border px-3 font-mono text-sm" required value={requirementId} onChange={(event) => setRequirementId(event.target.value)} placeholder="req-checkout-timeout" /></label>
    <label className="grid gap-1 text-sm font-semibold text-slate-700"><T k="assessment.intentEn" /><textarea className="min-h-24 rounded-md border border-border px-3 py-2 text-sm" required value={intentEn} onChange={(event) => setIntentEn(event.target.value)} /></label>
    <label className="grid gap-1 text-sm font-semibold text-slate-700"><T k="assessment.intentZh" /><textarea className="min-h-20 rounded-md border border-border px-3 py-2 text-sm" required value={intentZh} onChange={(event) => setIntentZh(event.target.value)} /></label>
    <div className="flex items-center gap-3"><button className="sf-sheen rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} type="submit">{busy ? (locale === "zh" ? "提交中…" : "Submitting…") : <T k="assessment.submit" />}</button>{state ? <span aria-live="polite" className="text-xs text-muted">{state}</span> : null}</div>
  </form>;
}
