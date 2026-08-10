"use client";

import React from "react";
import type { KnowledgeProjectionEdge, KnowledgeProjectionNode } from "@specforge/core";
import { ArrowDownToLine, ArrowUpFromLine, X } from "lucide-react";
import { T } from "../language-provider";

export function ArchitectureDetailDrawer({ node, edges, onClose }: { node?: KnowledgeProjectionNode; edges: KnowledgeProjectionEdge[]; onClose: () => void }) {
  if (!node) return null;
  const incoming = edges.filter((edge) => edge.targetAssertionId === node.assertionId);
  const outgoing = edges.filter((edge) => edge.sourceAssertionId === node.assertionId);
  return <aside className="sf-rise fixed inset-x-4 bottom-4 z-30 max-h-[75vh] overflow-auto rounded-lg border border-slate-700 bg-slate-950 p-5 text-white shadow-2xl lg:inset-x-auto lg:right-8 lg:top-24 lg:bottom-8 lg:w-[26rem]" aria-label="Architecture fact detail"><div className="flex items-start justify-between gap-4"><div><div className="font-mono text-[11px] uppercase text-blue-300">{node.layer} · {node.acceptedAssetType ?? "knowledge assertion"}</div><h2 className="mt-2 break-words text-lg font-semibold">{node.semanticIdentity}</h2><p className="mt-1 break-all font-mono text-[11px] text-slate-400">{node.assertionId}</p></div><button aria-label="Close details" className="rounded-md p-1 text-slate-300 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-300" onClick={onClose} type="button"><X size={18} /></button></div><div className="mt-5 grid gap-3 text-sm"><DetailRow label={<T k="threeA.status" />} value={<span className="text-emerald-300"><T k="threeA.published" /></span>} /><DetailRow label={<T k="threeA.digest" />} value={<span className="break-all font-mono text-[11px] text-slate-300">{node.contentDigest}</span>} /><DetailRow label={<T k="threeA.incoming" />} value={String(incoming.length)} icon={<ArrowDownToLine size={14} />} /><DetailRow label={<T k="threeA.outgoing" />} value={String(outgoing.length)} icon={<ArrowUpFromLine size={14} />} /></div><div className="mt-5 border-t border-white/10 pt-4"><h3 className="text-xs font-semibold uppercase tracking-wide text-blue-200"><T k="threeA.evidence" /></h3><p className="mt-2 text-sm leading-6 text-slate-300"><T k="threeA.evidenceDescription" /></p></div></aside>;
}

function DetailRow({ label, value, icon }: { label: React.ReactNode; value: React.ReactNode; icon?: React.ReactNode }) {
  return <div className="grid grid-cols-[7rem_1fr] items-start gap-3"><div className="flex items-center gap-1 text-xs text-slate-400">{icon}{label}</div><div className="min-w-0 text-right">{value}</div></div>;
}
