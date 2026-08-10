export interface ThreeAUrlState {
  scope: string;
  baseline?: string;
  projection?: string;
  focus?: string;
  tab: "architecture" | "alignment" | "drift";
  mode: "lanes" | "graph" | "list";
  direction: "upstream" | "downstream" | "both";
}

const defaultState = { tab: "architecture", mode: "lanes", direction: "both" } as const;

export function parseThreeAUrlState(params: URLSearchParams): ThreeAUrlState {
  const scope = nonEmpty(params.get("scope")) ?? "com.huawei.celon.desiner";
  const tab = enumValue(params.get("tab"), ["architecture", "alignment", "drift"] as const) ?? defaultState.tab;
  const mode = enumValue(params.get("mode"), ["lanes", "graph", "list"] as const) ?? defaultState.mode;
  const direction = enumValue(params.get("direction"), ["upstream", "downstream", "both"] as const) ?? defaultState.direction;
  return {
    scope,
    ...(nonEmpty(params.get("baseline")) ? { baseline: nonEmpty(params.get("baseline")) } : {}),
    ...(nonEmpty(params.get("projection")) ? { projection: nonEmpty(params.get("projection")) } : {}),
    ...(nonEmpty(params.get("focus")) ? { focus: nonEmpty(params.get("focus")) } : {}),
    tab,
    mode,
    direction
  };
}

export function serializeThreeAUrlState(state: ThreeAUrlState): string {
  const params = new URLSearchParams({ scope: state.scope, tab: state.tab, mode: state.mode, direction: state.direction });
  if (state.baseline) params.set("baseline", state.baseline);
  if (state.projection) params.set("projection", state.projection);
  if (state.focus) params.set("focus", state.focus);
  return params.toString();
}

function nonEmpty(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 256) : undefined;
}

function enumValue<T extends readonly string[]>(value: string | null, allowed: T): T[number] | undefined {
  return value && (allowed as readonly string[]).includes(value) ? value as T[number] : undefined;
}
