"use client";

import React from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { KnowledgeProjectionNode } from "@specforge/core";

export type ArchitectureGraphFlowNode = Node<{
  fact: KnowledgeProjectionNode;
  role: "upstream" | "focus" | "downstream";
  roleLabel: string;
  onSelect: () => void;
}, "architecture">;

export function ArchitectureGraphNode({ data, selected }: NodeProps<ArchitectureGraphFlowNode>) {
  return <div className={`rounded-lg border bg-white shadow-panel ${selected ? "border-accent ring-2 ring-blue-100" : "border-border"}`}>
    <Handle type="target" position={Position.Left} className="opacity-60" />
    <button type="button" className="w-56 p-3 text-left focus:outline-none focus:ring-2 focus:ring-accent" aria-pressed={selected} onClick={data.onSelect}>
      <span className="font-mono text-[11px] font-bold text-accent">{data.fact.layer} · {data.roleLabel}</span>
      <span className="mt-1 line-clamp-2 block min-h-10 text-sm font-semibold text-ink">{data.fact.semanticIdentity}</span>
      <span className="mt-2 block truncate font-mono text-[11px] text-muted">#{data.fact.assertionId.slice(0, 8)}</span>
    </button>
    <Handle type="source" position={Position.Right} className="opacity-60" />
  </div>;
}
