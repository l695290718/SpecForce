import { clsx } from "clsx";
import Link from "next/link";
import type { ReactNode } from "react";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx("sf-glass sf-rise rounded-xl border border-white/70 p-5 shadow-panel ring-1 ring-white/50 transition duration-200 hover:-translate-y-1 hover:border-blue-200/90 hover:shadow-glow", className)}>{children}</section>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "red" | "blue" | "amber" }) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700 ring-slate-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    red: "bg-rose-50 text-rose-700 ring-rose-200",
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200"
  };
  const dots = {
    neutral: "bg-slate-400",
    green: "bg-emerald-500",
    red: "bg-rose-500",
    blue: "bg-blue-500",
    amber: "bg-amber-500"
  };
  return <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", tones[tone])}><span aria-hidden="true" className={clsx("h-1.5 w-1.5 rounded-full", dots[tone])} />{children}</span>;
}

export function PageHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="sf-deck sf-rise relative mb-6 overflow-hidden rounded-xl border border-white/10 p-6 shadow-deck md:flex md:items-end md:justify-between">
      <div className="absolute inset-0 sf-hero-grid" aria-hidden="true" />
      <div className="sf-scan absolute inset-0 opacity-40" aria-hidden="true" />
      <div className="relative min-w-0">
        <div className="mb-2 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-blue-300">
          <span className="sf-pulse inline-block h-2 w-2 rounded-sm bg-gradient-to-br from-blue-400 to-violet-400 shadow-[0_0_10px_rgba(129,140,248,0.9)]" aria-hidden="true" />
          SPECFORGE CONTROL
        </div>
        <h1 className="sf-gradient-text text-2xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">{description}</p> : null}
      </div>
      {action ? <div className="relative mt-4 shrink-0 md:mt-0">{action}</div> : null}
    </div>
  );
}

export function ButtonLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      className="sf-sheen group relative inline-flex h-9 items-center gap-1.5 overflow-hidden rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 text-sm font-semibold text-white shadow-glow transition hover:-translate-y-0.5 hover:from-blue-500 hover:to-violet-500 hover:shadow-glow-strong focus:outline-none focus:ring-2 focus:ring-violet-300"
      href={href}
    >
      <span aria-hidden="true" className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
      <span className="relative">{children}</span>
    </Link>
  );
}

export function DataTable({ columns, rows }: { columns: ReactNode[]; rows: Array<Array<ReactNode>> }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-panel/90 shadow-panel backdrop-blur">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="border-b border-border bg-chrome/85 text-xs uppercase tracking-wider text-muted">
          <tr>{columns.map((column, index) => <th className="px-4 py-3 font-bold" key={index}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr className="border-t border-border/70 transition hover:bg-blue-50/55 focus-within:bg-blue-50/55" key={rowIndex}>
              {row.map((cell, cellIndex) => <td className="px-4 py-3.5 align-top text-slate-700" key={cellIndex}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
