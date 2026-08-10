"use client";

import React from "react";
import type { KnowledgeProjectionNode } from "@specforge/core";

export function ArchitectureNodeCard({ node, onFocus, focused = false }: { node: KnowledgeProjectionNode; onFocus: (assertionId: string) => void; focused?: boolean }) {
  return <button className="sf-rise min-h-24 w-full rounded-md border border-white/80 bg-white p-3 text-left shadow-sm transition duration-180 hover:-translate-y-0.5 hover:border-accent hover:shadow-elevated focus:outline-none focus:ring-2 focus:ring-accent" aria-pressed={focused} data-testid={`three-a-node-${node.assertionId}`} onClick={() => onFocus(node.assertionId)} type="button">
    <div className="truncate font-mono text-[11px] font-bold uppercase text-accent">{node.layer}</div>
    <div className="mt-1 line-clamp-2 min-h-10 break-words text-sm font-semibold text-ink">{node.semanticIdentity}</div>
    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted"><span className="truncate">{node.acceptedAssetType ?? "knowledge assertion"}</span><span title={node.assertionId}>#{node.assertionId.slice(0, 8)}</span></div>
  </button>;
}
