import { clsx } from "clsx";
import Link from "next/link";
import type { ReactNode } from "react";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx("sf-rise rounded-lg border border-border bg-panel p-5 shadow-panel ring-1 ring-white/70 transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-elevated", className)}>{children}</section>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "red" | "blue" | "amber" }) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700",
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-rose-50 text-rose-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700"
  };
  return <span className={clsx("inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold", tones[tone])}>{children}</span>;
}

export function PageHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="sf-scan sf-border-live mb-6 rounded-lg border border-border bg-white/[0.85] p-5 shadow-panel backdrop-blur md:flex md:items-end md:justify-between">
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2 font-mono text-[11px] font-semibold uppercase text-rule">
          <span className="sf-pulse h-2 w-2 rounded-sm bg-rule" />
          SPECFORGE CONTROL
        </div>
        <h1 className="text-2xl font-semibold tracking-normal text-ink">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm text-muted">{description}</p> : null}
      </div>
      {action ? <div className="mt-4 shrink-0 md:mt-0">{action}</div> : null}
    </div>
  );
}

export function ButtonLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="inline-flex h-9 items-center rounded-md bg-accent px-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-elevated focus:outline-none focus:ring-2 focus:ring-blue-200" href={href}>
      {children}
    </Link>
  );
}

export function DataTable({ columns, rows }: { columns: ReactNode[]; rows: Array<Array<ReactNode>> }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-panel shadow-panel">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="border-b border-border bg-chrome text-xs uppercase text-muted">
          <tr>{columns.map((column, index) => <th className="px-4 py-3 font-bold" key={index}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr className="border-t border-border transition hover:bg-blue-50/45" key={rowIndex}>
              {row.map((cell, cellIndex) => <td className="px-4 py-3.5 align-top text-slate-700" key={cellIndex}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
