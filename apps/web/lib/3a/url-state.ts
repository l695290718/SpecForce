export interface ThreeAUrlState {
  scope: string;
  baseline?: string;
  projection?: string;
  focus?: string;
  tab: "architecture" | "alignment" | "drift" | "coverage";
  mode: "lanes" | "graph" | "list";
  direction: "upstream" | "downstream" | "both";
  graphRepresentation?: "map" | "network";
  unit?: string;
  mapQuery?: string;
  mapLayers?: Array<"BIZ" | "SYS" | "TECH">;
  mapKinds?: string[];
  mappingFamilies?: string[];
  minCriticality?: number;
  minCompleteness?: number;
  includeUnclassified?: boolean;
  transition?: "BIZ_SYS" | "SYS_TECH";
  graphView?: "overview" | "explore" | "impact";
  graphLayout?: "force" | "tree" | "circles";
  layers?: Array<"BIZ" | "SYS" | "TECH">;
  relationTypes?: string[];
}

const defaultState = { tab: "architecture", mode: "lanes", direction: "both", graphRepresentation: "map", graphView: "overview", graphLayout: "force", layers: [], relationTypes: [], mapLayers: [], mapKinds: [], mappingFamilies: [] } as const;

export function parseThreeAUrlState(params: URLSearchParams): ThreeAUrlState {
  const scope = nonEmpty(params.get("scope")) ?? "com.huawei.celon.desiner";
  const tab = enumValue(params.get("tab"), ["architecture", "alignment", "drift", "coverage"] as const) ?? defaultState.tab;
  const mode = enumValue(params.get("mode"), ["lanes", "graph", "list"] as const) ?? defaultState.mode;
  const direction = enumValue(params.get("direction"), ["upstream", "downstream", "both"] as const) ?? defaultState.direction;
  const graphRepresentation = enumValue(params.get("graphRepresentation"), ["map", "network"] as const) ?? defaultState.graphRepresentation;
  const graphView = enumValue(params.get("graphView"), ["overview", "explore", "impact"] as const) ?? defaultState.graphView;
  const graphLayout = enumValue(params.get("graphLayout"), ["force", "tree", "circles"] as const) ?? defaultState.graphLayout;
  return {
    scope,
    ...(nonEmpty(params.get("baseline")) ? { baseline: nonEmpty(params.get("baseline")) } : {}),
    ...(nonEmpty(params.get("projection")) ? { projection: nonEmpty(params.get("projection")) } : {}),
    ...(nonEmpty(params.get("focus")) ? { focus: nonEmpty(params.get("focus")) } : {}),
    tab,
    mode,
    direction,
    graphRepresentation,
    ...(nonEmpty(params.get("unit")) ? { unit: nonEmpty(params.get("unit")) } : {}),
    ...(nonEmpty(params.get("mapQuery")) ? { mapQuery: nonEmpty(params.get("mapQuery")) } : {}),
    mapLayers: listValue(params.get("mapLayers"), ["BIZ", "SYS", "TECH"]) as Array<"BIZ" | "SYS" | "TECH">,
    mapKinds: listValue(params.get("mapKinds")),
    mappingFamilies: listValue(params.get("mappingFamilies")),
    ...(boundedNumber(params.get("minCriticality")) !== undefined ? { minCriticality: boundedNumber(params.get("minCriticality")) } : {}),
    ...(boundedNumber(params.get("minCompleteness")) !== undefined ? { minCompleteness: boundedNumber(params.get("minCompleteness")) } : {}),
    ...(params.get("includeUnclassified") === "true" ? { includeUnclassified: true } : {}),
    ...(enumValue(params.get("transition"), ["BIZ_SYS", "SYS_TECH"] as const) ? { transition: enumValue(params.get("transition"), ["BIZ_SYS", "SYS_TECH"] as const) } : {}),
    graphView,
    graphLayout,
    layers: listValue(params.get("layers"), ["BIZ", "SYS", "TECH"]) as Array<"BIZ" | "SYS" | "TECH">,
    relationTypes: listValue(params.get("relations"))
  };
}

export function serializeThreeAUrlState(state: ThreeAUrlState): string {
  const params = new URLSearchParams({ scope: state.scope, tab: state.tab, mode: state.mode, direction: state.direction, graphRepresentation: state.graphRepresentation ?? "map", graphView: state.graphView ?? "overview", graphLayout: state.graphLayout ?? "force" });
  if (state.baseline) params.set("baseline", state.baseline);
  if (state.projection) params.set("projection", state.projection);
  if (state.focus) params.set("focus", state.focus);
  if (state.unit) params.set("unit", state.unit);
  if (state.mapQuery) params.set("mapQuery", state.mapQuery);
  const mapLayers = listValue((state.mapLayers ?? []).join(","), ["BIZ", "SYS", "TECH"]);
  const mapKinds = listValue((state.mapKinds ?? []).join(","));
  const mappingFamilies = listValue((state.mappingFamilies ?? []).join(","));
  if (mapLayers.length) params.set("mapLayers", mapLayers.join(","));
  if (mapKinds.length) params.set("mapKinds", mapKinds.join(","));
  if (mappingFamilies.length) params.set("mappingFamilies", mappingFamilies.join(","));
  if (state.minCriticality !== undefined) params.set("minCriticality", String(state.minCriticality));
  if (state.minCompleteness !== undefined) params.set("minCompleteness", String(state.minCompleteness));
  if (state.includeUnclassified) params.set("includeUnclassified", "true");
  if (state.transition) params.set("transition", state.transition);
  const layers = listValue((state.layers ?? []).join(","), ["BIZ", "SYS", "TECH"]);
  const relationTypes = listValue((state.relationTypes ?? []).join(","));
  if (layers.length) params.set("layers", layers.join(","));
  if (relationTypes.length) params.set("relations", relationTypes.join(","));
  return params.toString();
}

function nonEmpty(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 256) : undefined;
}

function enumValue<T extends readonly string[]>(value: string | null, allowed: T): T[number] | undefined {
  return value && (allowed as readonly string[]).includes(value) ? value as T[number] : undefined;
}

function boundedNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? Number(parsed.toFixed(3)) : undefined;
}

function listValue<T extends readonly string[]>(value: string | null, allowed?: T): T extends readonly (infer U)[] ? U[] : string[] {
  const values = (value ?? "").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 20);
  const filtered = allowed ? values.filter((item) => (allowed as readonly string[]).includes(item)) : values.filter((item) => item.length <= 64);
  return [...new Set(filtered)].sort() as T extends readonly (infer U)[] ? U[] : string[];
}
