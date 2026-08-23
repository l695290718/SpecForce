"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { T, useLanguage } from "../language-provider";
import type { ThreeACoverageReport } from "../../lib/3a/workspace-loader";

export const COVERAGE_PAGE_SIZE = 25;

export function CoverageDetail({ rows }: { rows: ThreeACoverageReport["rows"] }) {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const rowKey = useMemo(() => rows.map((row) => `${row.assetType}:${row.assetId}:${row.rowDigest}`).join("|"), [rows]);
  useEffect(() => setPage(1), [rowKey]);
  const pageState = paginateCoverageRows(rows, page);
  return <section className="rounded-lg border border-border bg-white shadow-panel" data-testid="coverage-detail">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3"><div><h3 className="text-sm font-semibold text-ink"><T k="threeA.assetMappingDetail" /></h3><p className="mt-0.5 text-xs text-muted"><T k="threeA.coverageBounded" /></p></div><div className="flex items-center gap-2"><span className="font-mono text-[11px] text-muted">{t("threeA.coveragePageStatus").replace("{page}", String(pageState.page)).replace("{pages}", String(pageState.pageCount)).replace("{total}", String(rows.length))}</span><button aria-label={t("threeA.coveragePreviousPage")} className="inline-grid h-8 w-8 place-items-center rounded border border-border text-muted transition hover:border-slate-400 hover:text-ink disabled:cursor-not-allowed disabled:opacity-35" disabled={pageState.page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} title={t("threeA.coveragePreviousPage")} type="button"><ChevronLeft size={16} /></button><button aria-label={t("threeA.coverageNextPage")} className="inline-grid h-8 w-8 place-items-center rounded border border-border text-muted transition hover:border-slate-400 hover:text-ink disabled:cursor-not-allowed disabled:opacity-35" disabled={pageState.page === pageState.pageCount} onClick={() => setPage((value) => Math.min(pageState.pageCount, value + 1))} title={t("threeA.coverageNextPage")} type="button"><ChevronRight size={16} /></button></div></div>
    <div className="divide-y divide-border px-4">{pageState.rows.length ? pageState.rows.map((row) => { const mode = row.status === "BLOCKED" || row.status === "NOT_EVALUATED" ? "BLOCKED" : row.role === "MEMBERSHIP" ? "DIRECT" : row.role === "EXEMPTION" ? "EXEMPT" : "TRACE"; return <div key={`${row.assetType}:${row.assetId}`} className="grid gap-2 py-3 md:grid-cols-[minmax(0,1fr)_100px_110px_minmax(0,1.4fr)] md:items-center"><div className="min-w-0"><p className="truncate font-mono text-xs text-ink">{row.assetId}</p><p className="text-xs text-muted">{row.assetType}</p></div><span className={`text-xs font-semibold ${mode === "DIRECT" ? "text-emerald-700" : mode === "TRACE" ? "text-blue-700" : mode === "BLOCKED" ? "text-rose-700" : "text-amber-700"}`}>{mode}</span><span className={`text-xs font-semibold ${row.status === "COVERED" ? "text-emerald-700" : row.status === "BLOCKED" ? "text-rose-700" : "text-amber-700"}`}>{row.status}</span><div className="flex min-w-0 items-center gap-1 text-xs text-muted">{row.reasonCode ? <span className="truncate">{row.reasonCode}</span> : row.terminalMemberId ? <><span className="truncate">{row.terminalMemberId}</span><ChevronRight size={13} /></> : <T k="threeA.coverageNoPath" />}</div></div>; }) : <div className="py-8 text-center text-sm text-muted"><T k="threeA.coverageEmpty" /></div>}</div>
  </section>;
}

export function paginateCoverageRows(rows: ThreeACoverageReport["rows"], requestedPage: number, pageSize = COVERAGE_PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, Math.floor(requestedPage)));
  const start = (page - 1) * pageSize;
  return { page, pageCount, rows: rows.slice(start, start + pageSize) };
}
