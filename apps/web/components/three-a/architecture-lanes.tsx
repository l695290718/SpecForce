"use client";

import React from "react";
import type { KnowledgeProjectionNode } from "@specforge/core";
import { Boxes, Braces, Cpu, type LucideIcon } from "lucide-react";
import { T } from "../language-provider";

const lanes = [
  { layer: "BIZ" as const, titleKey: "threeA.business", Icon: Boxes, tone: "border-amber-200 bg-amber-50/45" },
  { layer: "SYS" as const, titleKey: "threeA.system", Icon: Braces, tone: "border-blue-200 bg-blue-50/45" },
  { layer: "TECH" as const, titleKey: "threeA.technology", Icon: Cpu, tone: "border-emerald-200 bg-emerald-50/45" }
] as const;

export function ArchitectureLanes({ nodes, onFocus }: { nodes: KnowledgeProjectionNode[]; onFocus: (assertionId: string) => void }) {
  return <div className="grid gap-4 lg:grid-cols-3" data-testid="architecture-lanes">
    {lanes.map(({ layer, titleKey, Icon, tone }) => {
      const layerNodes = nodes.filter((node) => node.layer === layer);
      return <section className={`min-h-64 rounded-lg border p-3 ${tone}`} key={layer} aria-labelledby={`lane-${layer}`}>
        <div className="mb-3 flex items-center justify-between border-b border-black/10 pb-2"><h2 className="flex items-center gap-2 text-sm font-bold text-ink" id={`lane-${layer}`}><Icon size={16} /><T k={titleKey} /></h2><span className="font-mono text-xs text-muted">{layerNodes.length}</span></div>
        <div className="grid gap-2">{layerNodes.length ? layerNodes.map((node) => <NodeCard key={node.assertionId} node={node} onFocus={onFocus} />) : <p className="px-2 py-6 text-center text-xs text-muted"><T k="threeA.emptyLayer" /></p>}</div>
      </section>;
    })}
  </div>;
}

export function NodeCard({ node, onFocus }: { node: KnowledgeProjectionNode; onFocus: (assertionId: string) => void }) {
  return <button className="sf-rise w-full rounded-md border border-white/80 bg-white p-3 text-left shadow-sm transition duration-180 hover:-translate-y-0.5 hover:border-accent hover:shadow-elevated focus:outline-none focus:ring-2 focus:ring-accent" data-testid={`three-a-node-${node.assertionId}`} onClick={() => onFocus(node.assertionId)} type="button">
    <div className="truncate font-mono text-[11px] font-bold uppercase text-accent">{node.layer}</div>
    <div className="mt-1 break-words text-sm font-semibold text-ink">{node.semanticIdentity}</div>
    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted"><span className="truncate">{node.acceptedAssetType ?? "knowledge assertion"}</span><span title={node.assertionId}>#{node.assertionId.slice(0, 8)}</span></div>
  </button>;
}
