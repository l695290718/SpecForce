"use client";

import type { ArchitectureMapQueryResult } from "@specforge/knowledge-query";
import React from "react";
import { ArrowRight, Boxes, Braces, Cpu } from "lucide-react";
import { useMemo, useState } from "react";
import { T } from "../language-provider";
import { layoutArchitectureMap } from "./architecture-map-layout";

const layerConfig = { BIZ: { Icon: Boxes, color: "#b45309", fill: "#fffbeb", label: "threeA.business" }, SYS: { Icon: Braces, color: "#2563eb", fill: "#eff6ff", label: "threeA.system" }, TECH: { Icon: Cpu, color: "#047857", fill: "#ecfdf5", label: "threeA.technology" } } as const;

export function ArchitectureMapRenderer({ result, onSelect }: { result: ArchitectureMapQueryResult; onSelect: (unitIdentity: string) => void }) {
  const [viewportWidth, setViewportWidth] = useState(1200);
  const [selected, setSelected] = useState<string>();
  const layout = useMemo(() => layoutArchitectureMap(result, { width: viewportWidth, height: 600 }), [result, viewportWidth]);
  if (result.availability === "NO_GOVERNED_ARCHITECTURE_UNITS") return <EmptyMap />;
  const selectedIds = selected ? new Set([selected, ...result.mappings.filter((mapping) => mapping.sourceUnitIdentity === selected || mapping.targetUnitIdentity === selected).flatMap((mapping) => [mapping.sourceUnitIdentity, mapping.targetUnitIdentity])]) : undefined;
  return <section data-testid="architecture-map" className="space-y-3">
    <div className="flex items-center justify-between text-xs text-muted"><span>{result.units.length} <T k="threeA.mapUnits" /> · {result.mappings.length} <T k="threeA.mapMappings" /></span><span>{result.unclassifiedCount} <T k="threeA.mapUnclassified" /></span></div>
    <div className="overflow-auto rounded-lg border border-border bg-slate-50 p-2" onMouseEnter={() => setViewportWidth(window.innerWidth)}>
      <svg aria-label="3A architecture map" className="min-w-[720px]" role="img" viewBox={"0 0 " + layout.width + " " + layout.height} width="100%">
        <defs><marker id="architecture-map-arrow" markerHeight="7" markerWidth="7" orient="auto" refX="6" refY="3.5"><path d="M0,0 L7,3.5 L0,7 z" fill="#94a3b8" /></marker></defs>
        {(["BIZ", "SYS", "TECH"] as const).map((layer, index) => { const config = layerConfig[layer]; const Icon = config.Icon; const columnWidth = (layout.width - 64) / 3; const x = layout.mobile ? 16 : 16 + index * (columnWidth + 16); return <g key={layer}><rect fill={config.fill} height={layout.height - 24} rx="12" stroke={config.color} strokeDasharray="3 5" strokeOpacity=".25" width={layout.mobile ? layout.width - 32 : columnWidth} x={x} y="12" /><foreignObject height="30" width="220" x={x + 12} y="18"><div className="flex items-center gap-2 text-xs font-bold" style={{ color: config.color }}><Icon size={14} /><T k={config.label} /></div></foreignObject></g>; })}
        {layout.mappings.map(({ mapping, x1, y1, x2, y2 }) => <line key={mapping.mappingIdentity} markerEnd="url(#architecture-map-arrow)" opacity={selectedIds && !selectedIds.has(mapping.sourceUnitIdentity) && !selectedIds.has(mapping.targetUnitIdentity) ? .14 : .65} stroke="#94a3b8" strokeWidth={selectedIds?.has(mapping.sourceUnitIdentity) || selectedIds?.has(mapping.targetUnitIdentity) ? 2.5 : 1.4} x1={x1} x2={x2} y1={y1} y2={y2} />)}
        {layout.units.map(({ unit, x, y, width, height }) => { const config = layerConfig[unit.layer]; const active = !selectedIds || selectedIds.has(unit.unitIdentity); return <g aria-label={unit.canonicalName + " " + unit.kind} className="cursor-pointer outline-none" data-testid={"architecture-unit-" + unit.unitIdentity} key={unit.unitIdentity} onClick={() => { setSelected(unit.unitIdentity); onSelect(unit.unitIdentity); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(unit.unitIdentity); onSelect(unit.unitIdentity); } }} opacity={active ? 1 : .3} role="button" tabIndex={0}><rect fill="white" height={height} rx="9" stroke={unit.unitIdentity === selected ? config.color : "#cbd5e1"} strokeWidth={unit.unitIdentity === selected ? 3 : 1.2} width={width} x={x} y={y} /><text fill="#0f172a" fontSize="13" fontWeight="700" x={x + 12} y={y + 22}>{truncate(unit.canonicalName, 30)}</text><text fill="#64748b" fontSize="10" x={x + 12} y={y + 40}>{unit.kind} · {unit.memberCount} members</text><rect fill={config.color} height="4" rx="2" width={Math.max(8, (width - 24) * unit.completeness)} x={x + 12} y={y + height - 12} /><text fill="#64748b" fontSize="9" textAnchor="end" x={x + width - 12} y={y + height - 14}>{Math.round(unit.completeness * 100)}%</text></g>; })}
      </svg>
    </div>
    <div className="flex flex-wrap gap-2 text-xs text-muted"><span className="inline-flex items-center gap-1"><ArrowRight size={13} /> <T k="threeA.mapDescription" /></span><span className="ml-auto">{result.partial ? <T k="threeA.mapPartial" /> : null}</span></div>
  </section>;
}

function EmptyMap() { return <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-8 text-center" data-testid="architecture-map-empty"><p className="font-semibold text-amber-950"><T k="threeA.mapEmpty" /></p><p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-amber-900/80"><T k="threeA.mapEmptyDescription" /></p></div>; }
function truncate(value: string, max: number) { return value.length > max ? value.slice(0, max - 1) + "…" : value; }
