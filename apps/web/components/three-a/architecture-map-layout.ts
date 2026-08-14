import type { ArchitectureMapQueryResult } from "@specforge/knowledge-query";
import type { ArchitectureUnitMappingProjection, ArchitectureUnitProjection } from "@specforge/core";

export interface ArchitectureMapViewport { width: number; height: number; }
export interface ArchitectureMapLayoutUnit { unit: ArchitectureUnitProjection; x: number; y: number; width: number; height: number; }
export interface ArchitectureMapLayoutMapping { mapping: ArchitectureUnitMappingProjection; x1: number; y1: number; x2: number; y2: number; }
export interface ArchitectureMapLayout { width: number; height: number; mobile: boolean; units: ArchitectureMapLayoutUnit[]; mappings: ArchitectureMapLayoutMapping[]; }

const layerOrder = { BIZ: 0, SYS: 1, TECH: 2 } as const;

export function layoutArchitectureMap(result: ArchitectureMapQueryResult, viewport: ArchitectureMapViewport): ArchitectureMapLayout {
  const mobile = viewport.width < 768;
  const unitWidth = mobile ? Math.max(220, viewport.width - 32) : Math.max(240, Math.floor((viewport.width - 64) / 3));
  const unitHeight = 70;
  const gap = 14;
  const groups = (Object.keys(layerOrder) as Array<"BIZ" | "SYS" | "TECH">).map((layer) => result.units.filter((unit) => unit.layer === layer).sort(compareUnits));
  const units: ArchitectureMapLayoutUnit[] = [];
  groups.forEach((group, layerIndex) => group.forEach((unit, index) => {
    units.push({
      unit,
      x: mobile ? 16 : 16 + layerIndex * (unitWidth + 16),
      y: mobile ? 44 + layerIndex * 190 + index * (unitHeight + gap) : 44 + index * (unitHeight + gap),
      width: unitWidth,
      height: unitHeight
    });
  }));
  const byId = new Map(units.map((item) => [item.unit.unitIdentity, item]));
  const mappings = result.mappings.flatMap((mapping) => {
    const source = byId.get(mapping.sourceUnitIdentity);
    const target = byId.get(mapping.targetUnitIdentity);
    if (!source || !target) return [];
    return [{ mapping, x1: source.x + source.width / 2, y1: source.y + source.height / 2, x2: target.x + target.width / 2, y2: target.y + target.height / 2 }];
  });
  const maxUnitBottom = Math.max(...units.map((item) => item.y + item.height), mobile ? 540 : viewport.height);
  return { width: mobile ? viewport.width : Math.max(viewport.width, 3 * unitWidth + 64), height: Math.max(viewport.height, maxUnitBottom + 44), mobile, units, mappings };
}

export function compareUnits(left: ArchitectureUnitProjection, right: ArchitectureUnitProjection): number {
  return layerOrder[left.layer] - layerOrder[right.layer]
    || (left.parentUnitIdentity ?? "").localeCompare(right.parentUnitIdentity ?? "", "en")
    || right.criticality - left.criticality
    || left.canonicalName.localeCompare(right.canonicalName, "en")
    || left.unitIdentity.localeCompare(right.unitIdentity, "en");
}
