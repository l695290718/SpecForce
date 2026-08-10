"use client";

import React from "react";
import type { KnowledgeProjectionEdge } from "@specforge/core";
import { ArrowRight, GitBranch } from "lucide-react";
import { T } from "../language-provider";

export function ArchitecturePathList({ edges, onFocus }: { edges: KnowledgeProjectionEdge[]; onFocus: (assertionId: string) => void }) {
  return <section className="rounded-lg border border-border bg-white p-4 shadow-panel" aria-labelledby="architecture-paths-title"><div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-bold text-ink" id="architecture-paths-title"><GitBranch size={16} className="text-accent" /><T k="threeA.relationships" /></h2><span className="font-mono text-xs text-muted">{edges.length}</span></div>{edges.length ? <ul className="grid gap-2 sm:grid-cols-2">{edges.map((edge) => <li className="rounded-md border border-border bg-chrome/40 p-3" key={edge.relationshipIdentity}><button className="w-full text-left focus:outline-none focus:ring-2 focus:ring-accent" onClick={() => onFocus(edge.sourceAssertionId)} type="button"><div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-ink"><span className="max-w-[35%] truncate">{edge.sourceSemanticIdentity}</span><ArrowRight className="shrink-0 text-accent" size={14} /><span className="max-w-[35%] truncate">{edge.targetSemanticIdentity}</span></div><div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted"><span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-blue-700">{edge.relationCode}</span><span>{Math.round(edge.confidence * 100)}%</span></div></button></li>)}</ul> : <p className="py-7 text-center text-sm text-muted"><T k="threeA.emptyRelationships" /></p>}</section>;
}
