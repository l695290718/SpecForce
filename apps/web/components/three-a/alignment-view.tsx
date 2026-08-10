import React from "react";
import type { KnowledgeProjectionEdge } from "@specforge/core";
import { ArrowRight, Layers3 } from "lucide-react";
import { T } from "../language-provider";

export function AlignmentView({ edges }: { edges: KnowledgeProjectionEdge[] }) {
  return <section className="rounded-lg border border-border bg-white p-5 shadow-panel" aria-labelledby="three-a-alignment-title"><div className="flex items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 text-base font-semibold text-ink" id="three-a-alignment-title"><Layers3 className="text-accent" size={18} /><T k="threeA.alignment" /></h2><p className="mt-1 text-sm text-muted"><T k="threeA.alignmentDescription" /></p></div><span className="font-mono text-xs text-muted">{edges.length}</span></div>{edges.length ? <ul className="mt-5 grid gap-3">{edges.map((edge) => <li className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-chrome/40 px-3 py-3 text-sm" key={edge.relationshipIdentity}><span className="max-w-[34%] truncate font-medium">{edge.sourceSemanticIdentity}</span><ArrowRight className="text-accent" size={15} /><span className="rounded bg-blue-50 px-2 py-1 font-mono text-[11px] font-bold text-blue-700">{edge.relationCode}</span><ArrowRight className="text-accent" size={15} /><span className="max-w-[34%] truncate font-medium">{edge.targetSemanticIdentity}</span></li>)}</ul> : <Empty labelKey="threeA.emptyAlignment" />}</section>;
}

function Empty({ labelKey }: { labelKey: "threeA.emptyAlignment" }) { return <p className="py-12 text-center text-sm text-muted"><T k={labelKey} /></p>; }
