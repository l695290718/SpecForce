"use client";

import React from "react";
import type { KnowledgeProjectionEdge } from "@specforge/core";
import { ArrowRight, X } from "lucide-react";
import { T } from "../language-provider";

export function ArchitectureRelationshipInspector({ edge, onClose }: { edge?: KnowledgeProjectionEdge; onClose: () => void }) {
  if (!edge) return null;
  return <aside className="sf-rise rounded-lg border border-slate-700 bg-slate-950 p-4 text-white shadow-2xl" aria-label="Relationship detail"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[11px] uppercase text-blue-300"><T k="threeA.relationshipDetail" /></p><h3 className="mt-2 flex items-center gap-2 text-sm font-semibold"><span className="max-w-32 truncate">{edge.sourceSemanticIdentity}</span><ArrowRight size={14} className="text-blue-300" /><span className="rounded bg-blue-300/15 px-2 py-1 font-mono text-[11px] text-blue-100">{edge.relationCode}</span><ArrowRight size={14} className="text-blue-300" /><span className="max-w-32 truncate">{edge.targetSemanticIdentity}</span></h3></div><button aria-label="Close relationship detail" className="rounded-md p-1 text-slate-300 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-300" onClick={onClose} type="button"><X size={16} /></button></div><dl className="mt-4 grid gap-2 text-xs"><div className="flex justify-between gap-3"><dt className="text-slate-400"><T k="threeA.confidence" /></dt><dd>{Math.round(edge.confidence * 100)}%</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-400"><T k="threeA.relationshipVersion" /></dt><dd className="font-mono">{edge.relationshipVersion}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-400"><T k="threeA.evidence" /></dt><dd className="max-w-48 truncate font-mono">{edge.relationshipAssertionId ?? edge.relationshipEventId ?? "-"}</dd></div></dl></aside>;
}
