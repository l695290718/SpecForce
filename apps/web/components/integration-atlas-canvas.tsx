"use client";

import { useMemo, useState } from "react";
import type { AtlasEdge, AtlasNode } from "../lib/integrations/atlas";
import { useLanguage } from "./language-provider";
import type { Locale } from "../lib/i18n";

const PROTOCOL_COLORS: Record<string, string> = {
  REST_API: "#0f766e",
  GRPC: "#6d28d9",
  MESSAGE_EVENT: "#b45309",
  FILE: "#475569",
  UNNORMALIZED: "#94a3b8"
};

const LABELS: Record<Locale, Record<string, string>> = {
  zh: {
    title: "集成图谱（有界投影）",
    hint: "点击连线查看契约详情。画布最多渲染 100 节点 / 200 边；完整清单以列表为准。",
    partial: "部分结果",
    restricted: "受限目标",
    unresolved: "未解析目标",
    noContracts: "当前可读范围内没有已登记的调用契约。",
    callKey: "调用键",
    locator: "定位器",
    lifecycle: "生命周期",
    ownerScope: "归属 Scope",
    close: "关闭"
  },
  en: {
    title: "Integration atlas (bounded projection)",
    hint: "Click an edge to open its contract. The canvas renders at most 100 nodes / 200 edges; the list below is the complete surface.",
    partial: "Partial results",
    restricted: "Restricted target",
    unresolved: "Unresolved target",
    noContracts: "No registered call contracts exist within the readable scopes yet.",
    callKey: "Call key",
    locator: "Locator",
    lifecycle: "Lifecycle",
    ownerScope: "Owning scope",
    close: "Close"
  }
};

export function IntegrationAtlasCanvas({ nodes, edges, partialReason, language }: { nodes: AtlasNode[]; edges: AtlasEdge[]; partialReason: string | null; language: Locale }) {
  const { t } = useLanguage();
  const labels = { ...LABELS.zh, ...LABELS.en, ...(LABELS[language] ?? {}) };
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | undefined>();
  const selected = useMemo(() => edges.find((edge) => edge.id === selectedEdgeId), [edges, selectedEdgeId]);

  const positioned = useMemo(() => {
    const width = 960;
    const height = Math.max(320, 120 + Math.ceil(nodes.length / 3) * 110);
    const scoped = nodes.filter((node) => node.kind === "scope");
    const others = nodes.filter((node) => node.kind !== "scope");
    const positions = new Map<string, { x: number; y: number }>();
    const columns: Record<string, AtlasNode[]> = { BIZ: [], SYS: [], TECH: [] };
    for (const node of scoped) {
      const layer = node.scopeId?.includes("desiner") ? "BIZ" : node.scopeId?.includes("policyhub") ? "SYS" : "TECH";
      (columns[layer === "BIZ" ? "BIZ" : layer === "SYS" ? "SYS" : "TECH"] ?? []).push(node);
    }
    (Object.keys(columns) as Array<"BIZ" | "SYS" | "TECH">).forEach((layer, layerIndex) => {
      const bucket = columns[layer] ?? [];
      bucket.forEach((node, index) => {
        positions.set(node.id, { x: 140 + layerIndex * 340, y: 70 + index * 96 });
      });
    });
    others.forEach((node, index) => {
      positions.set(node.id, { x: width - 150, y: 60 + index * 88 });
    });
    return { width, height, positions };
  }, [nodes]);

  if (!nodes.length || !edges.length) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-white p-8 text-center text-sm text-muted">
        <p className="font-semibold text-ink">{labels.title}</p>
        <p className="mt-2">{labels.noContracts}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-white p-4 shadow-panel" data-testid="integration-atlas">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="text-sm font-semibold text-ink">{labels.title}</span>
        {partialReason ? <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">{labels.partial} · {partialReason}</span> : null}
        <span>{labels.hint}</span>
      </div>
      <svg viewBox={`0 0 ${positioned.width} ${positioned.height}`} className="w-full overflow-visible rounded-md bg-slate-50">
        {edges.map((edge) => {
          const from = positioned.positions.get(edge.sourceNodeId);
          const to = positioned.positions.get(edge.targetNodeId);
          if (!from || !to) return null;
          const active = edge.id === selectedEdgeId;
          return (
            <g key={edge.id} onClick={() => setSelectedEdgeId(edge.id)} className={active ? "" : "cursor-pointer opacity-90 hover:opacity-100"}>
              <path d={`M ${from.x} ${from.y} C ${(from.x + to.x) / 2} ${from.y}, ${(from.x + to.x) / 2} ${to.y}, ${to.x} ${to.y}`} fill="none" stroke={PROTOCOL_COLORS[edge.protocolKind] ?? PROTOCOL_COLORS.UNNORMALIZED} strokeWidth={active ? 3 : 1.75} markerEnd="url(#atlas-arrow)" />
              <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 6} textAnchor="middle" className="fill-slate-500 text-[10px]">{edge.protocolKind}</text>
            </g>
          );
        })}
        <defs>
          <marker id="atlas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" /></marker>
        </defs>
        {nodes.map((node) => {
          const position = positioned.positions.get(node.id);
          if (!position) return null;
          const fill = node.kind === "scope" ? "#ffffff" : node.label.startsWith("受限") || node.label.startsWith("Restricted") ? "#fef2f2" : node.label.startsWith("未解析") || node.label.startsWith("Unresolved") ? "#fffbeb" : "#f8fafc";
          return (
            <g key={node.id}>
              <rect x={position.x - 92} y={position.y - 26} width={184} height={52} rx={9} fill={fill} stroke={node.kind === "scope" ? "#0f766e" : "#cbd5e1"} strokeWidth={1.5} />
              <text x={position.x} y={position.y + 4} textAnchor="middle" className="fill-slate-700 text-[11px] font-semibold">{node.label.length > 26 ? `${node.label.slice(0, 25)}…` : node.label}</text>
            </g>
          );
        })}
      </svg>
      {selected ? (
        <div className="rounded-md border border-border bg-slate-50 p-3 text-xs text-muted" data-testid="integration-atlas-drawer">
          <div className="flex items-center justify-between"><strong className="text-ink">{selected.contractId}</strong><button className="underline" onClick={() => setSelectedEdgeId(undefined)}>{labels.close}</button></div>
          <div className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <span>{labels.callKey}: <code>{selected.contractId}</code></span>
            <span>{labels.locator}: <code>{selected.restricted ? "—" : selected.protocolLocator || "—"}</code></span>
            <span>protocol: {selected.protocolKind}</span>
            <span>{labels.lifecycle}: {selected.lifecycle}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
