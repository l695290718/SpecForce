export interface ThreeAUrlState {
  scope: string;
  baseline?: string;
  projection?: string;
  focus?: string;
  tab: "architecture" | "alignment" | "drift";
  mode: "lanes" | "graph" | "list";
  direction: "upstream" | "downstream" | "both";
  graphView?: "overview" | "explore" | "impact";
  layers?: Array<"BIZ" | "SYS" | "TECH">;
  relationTypes?: string[];
}

const defaultState = { tab: "architecture", mode: "lanes", direction: "both", graphView: "overview", layers: [], relationTypes: [] } as const;

export function parseThreeAUrlState(params: URLSearchParams): ThreeAUrlState {
  const scope = nonEmpty(params.get("scope")) ?? "com.huawei.celon.desiner";
  const tab = enumValue(params.get("tab"), ["architecture", "alignment", "drift"] as const) ?? defaultState.tab;
  const mode = enumValue(params.get("mode"), ["lanes", "graph", "list"] as const) ?? defaultState.mode;
  const direction = enumValue(params.get("direction"), ["upstream", "downstream", "both"] as const) ?? defaultState.direction;
  const graphView = enumValue(params.get("graphView"), ["overview", "explore", "impact"] as const) ?? defaultState.graphView;
  return {
    scope,
    ...(nonEmpty(params.get("baseline")) ? { baseline: nonEmpty(params.get("baseline")) } : {}),
    ...(nonEmpty(params.get("projection")) ? { projection: nonEmpty(params.get("projection")) } : {}),
    ...(nonEmpty(params.get("focus")) ? { focus: nonEmpty(params.get("focus")) } : {}),
    tab,
    mode,
    direction,
    graphView,
    layers: listValue(params.get("layers"), ["BIZ", "SYS", "TECH"]) as Array<"BIZ" | "SYS" | "TECH">,
    relationTypes: listValue(params.get("relations"))
  };
}

export function serializeThreeAUrlState(state: ThreeAUrlState): string {
  const params = new URLSearchParams({ scope: state.scope, tab: state.tab, mode: state.mode, direction: state.direction, graphView: state.graphView ?? "overview" });
  if (state.baseline) params.set("baseline", state.baseline);
  if (state.projection) params.set("projection", state.projection);
  if (state.focus) params.set("focus", state.focus);
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

function listValue<T extends readonly string[]>(value: string | null, allowed?: T): T extends readonly (infer U)[] ? U[] : string[] {
  const values = (value ?? "").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 20);
  const filtered = allowed ? values.filter((item) => (allowed as readonly string[]).includes(item)) : values.filter((item) => item.length <= 64);
  return [...new Set(filtered)].sort() as T extends readonly (infer U)[] ? U[] : string[];
}
