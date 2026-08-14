"use client";

import type { ArchitectureUnitNeighborhoodResult } from "@specforge/knowledge-query";
import { X } from "lucide-react";
import { T } from "../language-provider";
import type { ReactNode } from "react";
import { ArchitectureMapNeighborhood } from "./architecture-map-neighborhood";

export function ArchitectureUnitInspector({ result, onClose, onSelect }: { result?: ArchitectureUnitNeighborhoodResult; onClose: () => void; onSelect: (unitIdentity: string) => void }) {
  if (!result) return null;
  const unit = result.unit;
  return <aside className="sf-rise space-y-4 rounded-lg border border-slate-700 bg-slate-950 p-5 text-white shadow-2xl" data-testid="architecture-unit-inspector"><header className="flex items-start justify-between gap-4"><div><div className="font-mono text-[11px] uppercase text-blue-300">{unit.layer} · {unit.kind}</div><h2 className="mt-2 text-lg font-semibold">{unit.canonicalName}</h2><p className="mt-1 break-all font-mono text-[11px] text-slate-400">{unit.unitIdentity}</p></div><button aria-label="Close architecture unit detail" className="rounded-md p-1 text-slate-300 hover:bg-white/10" onClick={onClose} type="button"><X size={18} /></button></header><div className="grid grid-cols-2 gap-3 text-sm"><Metric label={<T k="threeA.unitMembers" />} value={String(unit.memberCount)} /><Metric label={<T k="threeA.unitCompleteness" />} value={Math.round(unit.completeness * 100) + "%"} /><Metric label={<T k="threeA.unitCriticality" />} value={Math.round(unit.criticality * 100) + "%"} /><Metric label={<T k="threeA.unitEvidence" />} value={String(unit.evidenceCount)} /></div><div className="border-t border-white/10 pt-3 text-sm"><p className="text-slate-300"><T k="threeA.evidenceDescription" /></p><p className="mt-2 break-all font-mono text-[11px] text-slate-500">{unit.contentDigest}</p></div><div className="rounded-md bg-white/5 p-3 text-xs text-slate-300"><strong className="text-white"><T k="threeA.unitMembers" /></strong><span className="ml-2">{result.members.length} loaded · {result.sameLayerDependencies.length} same-layer dependencies</span></div><ArchitectureMapNeighborhood result={result} onSelect={onSelect} /></aside>;
}

function Metric({ label, value }: { label: ReactNode; value: string }) { return <div className="rounded-md bg-white/5 p-3"><div className="text-xs text-slate-400">{label}</div><div className="mt-1 font-semibold text-white">{value}</div></div>; }
