"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { RelationSummary } from "./architecture-graph-relations";
import { T } from "../language-provider";

export function ArchitectureGraphLegend({ relations, hiddenCodes, onToggle }: {
  relations: ReadonlyArray<RelationSummary>;
  hiddenCodes: ReadonlySet<string>;
  onToggle(code: string): void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (!relations.length) return null;
  return <div className="pointer-events-auto absolute bottom-3 left-3 max-w-[15rem] rounded-md border border-white/15 bg-slate-950/85 text-slate-200 shadow-elevated backdrop-blur" data-testid="architecture-graph-legend">
    <button aria-expanded={!collapsed} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-300" onClick={() => setCollapsed((value) => !value)} type="button">
      <T k="threeA.legendTitle" />
      {collapsed ? <ChevronDown aria-hidden="true" size={13} /> : <ChevronUp aria-hidden="true" size={13} />}
    </button>
    {collapsed ? null : (
      <ul className="grid gap-1 border-t border-white/10 p-2">
        {relations.map(({ code, count, rgb }) => {
          const hidden = hiddenCodes.has(code);
          return <li key={code}>
            <button
              aria-label={`${code}`}
              aria-pressed={hidden}
              className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition focus:outline-none focus:ring-2 focus:ring-blue-300 ${hidden ? "opacity-45" : "hover:bg-white/10"}`}
              data-testid={`architecture-graph-legend-${code}`}
              onClick={() => onToggle(code)}
              title={hidden ? undefined : code}
              type="button"
            >
              <span
                aria-hidden="true"
                className={`inline-block h-2.5 w-6 shrink-0 rounded-full ${hidden ? "opacity-40" : ""}`}
                style={{ backgroundColor: `rgba(${rgb},0.95)` }}
              />
              <span className="min-w-0 flex-1 truncate font-mono font-semibold">{code}</span>
              <span className="font-mono text-[10px] text-slate-400">{count}</span>
            </button>
          </li>;
        })}
      </ul>
    )}
    <p className="sr-only"><T k="threeA.relationFilterAria" /></p>
  </div>;
}
