import { buildScopedHref } from "./scope";

export function overviewDestinations(scopeId?: string): {
  workspace: string;
  graph: string;
  governance: string;
} {
  return {
    workspace: scopeId ? buildScopedHref("/workspace", scopeId) : "/workspace",
    graph: scopeId ? buildScopedHref("/graph", scopeId) : "/graph",
    governance: scopeId ? buildScopedHref("/governance/checks", scopeId) : "/governance/checks",
  };
}
