"use client";

import type { ArchitectureUnitNeighborhoodResult } from "@specforge/knowledge-query";
import { ArrowDown, ArrowUp, Link2 } from "lucide-react";
import { T } from "../language-provider";

export function ArchitectureMapNeighborhood({ result, onSelect }: { result: ArchitectureUnitNeighborhoodResult; onSelect: (unitIdentity: string) => void }) {
  return <div className="grid gap-3 md:grid-cols-2" data-testid="architecture-map-neighborhood">
    <section className="rounded-lg border border-border bg-white p-4"><h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><Link2 size={15} /><T k="threeA.unitNeighbors" /></h3><div className="mt-3 grid gap-2">{result.adjacentUnits.length ? result.adjacentUnits.map((unit) => <button className="flex items-center justify-between rounded-md border border-border p-2 text-left text-xs hover:border-accent" key={unit.unitIdentity} onClick={() => onSelect(unit.unitIdentity)} type="button"><span><strong className="block text-ink">{unit.canonicalName}</strong><span className="text-muted">{unit.layer} · {unit.kind}</span></span><span className="text-muted">{Math.round(unit.completeness * 100)}%</span></button>) : <p className="text-xs text-muted"><T k="threeA.emptyRelationships" /></p>}</div></section>
    <section className="rounded-lg border border-border bg-white p-4"><h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><ArrowDown size={15} /><T k="threeA.unitMappings" /></h3><div className="mt-3 grid gap-2">{result.mappings.length ? result.mappings.map((mapping) => <div className="rounded-md border border-border p-2 text-xs" key={mapping.mappingIdentity}><div className="flex items-center gap-2 text-ink"><span className="truncate">{mapping.sourceUnitIdentity}</span><ArrowUp className="shrink-0 text-accent" size={13} /><span className="truncate">{mapping.targetUnitIdentity}</span></div><div className="mt-1 text-muted">{mapping.mappingFamily} · {Math.round(mapping.confidence * 100)}%</div></div>) : <p className="text-xs text-muted"><T k="threeA.emptyRelationships" /></p>}</div></section>
  </div>;
}

