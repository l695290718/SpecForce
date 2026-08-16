import { headers } from "next/headers";
import { cookies } from "next/headers";
import { PageHeader } from "../../../components/ui";
import { T } from "../../../components/language-provider";
import { resolveThreeARequest, resolveWebAuthMode } from "../../../lib/3a/principal";
import { createWebThreeAQueryService } from "../../../lib/3a/service";
import { parseThreeAUrlState, type ThreeAUrlState } from "../../../lib/3a/url-state";
import { scopeById } from "@specforge/core";
import { ThreeAWorkspace } from "../../../components/three-a/three-a-workspace";
import { loadThreeAWorkspaceData, type ThreeAWorkspaceData } from "../../../lib/3a/workspace-loader";
import { loadThreeACoverageReport } from "../../../lib/3a/coverage-loader";

export default async function ThreeAArchitecturePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const state = parseThreeAUrlState(await awaitSearchParams(searchParams));
  const scope = scopeById(state.scope);
  const scopeRef = scope && scope.level === "applicationService" ? { applicationServiceId: scope.id, scopePath: scope.scopePath } : undefined;
  const base = emptyData(state);
  if (!scopeRef) return <ThreeAFrame><ThreeAWorkspace data={{ ...base, errorCode: "SCOPE_ACCESS_DENIED" }} /></ThreeAFrame>;

  try {
    const request = await resolveThreeARequest({ architectureScope: scopeRef, authMode: resolveWebAuthMode(), headers: await headers(), cookies: await cookies() });
    const service = createWebThreeAQueryService();
    const data = await loadThreeAWorkspaceData(service, request, state);
    data.coverage = await loadThreeACoverageReport(scopeRef);
    return <ThreeAFrame><ThreeAWorkspace data={data} /></ThreeAFrame>;
  } catch (error) {
    return <ThreeAFrame><ThreeAWorkspace data={{ ...base, errorCode: safeErrorCode(error) }} /></ThreeAFrame>;
  }
}

function ThreeAFrame({ children }: { children: React.ReactNode }) {
  return <><PageHeader title={<T k="threeA.title" />} description={<T k="threeA.description" />} /><section className="rounded-lg border border-slate-800 bg-slate-950 px-5 py-5 text-white shadow-elevated md:px-7"><div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><p className="font-mono text-[11px] font-semibold uppercase text-blue-300"><T k="threeA.eyebrow" /></p><h1 className="mt-2 text-2xl font-semibold"><T k="threeA.heroTitle" /></h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300"><T k="threeA.heroDescription" /></p></div><div className="grid grid-cols-3 gap-2 text-center text-xs"><span className="rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-amber-100"><strong className="block text-base">BIZ</strong><T k="threeA.business" /></span><span className="rounded-md border border-blue-300/20 bg-blue-300/10 px-3 py-2 text-blue-100"><strong className="block text-base">SYS</strong><T k="threeA.system" /></span><span className="rounded-md border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-emerald-100"><strong className="block text-base">TECH</strong><T k="threeA.technology" /></span></div></div></section><div className="mt-4">{children}</div></>;
}

function emptyData(state: ThreeAUrlState): ThreeAWorkspaceData { return { state, baselines: [], manifests: [] }; }
function safeErrorCode(error: unknown): string { const known = new Set(["SCOPE_ACCESS_DENIED", "BASELINE_NOT_FOUND", "PROJECTION_MANIFEST_REQUIRED", "THREE_A_CURSOR_KEY_REQUIRED", "WEB_PRINCIPAL_RESOLVER_REQUIRED", "WEB_PRINCIPAL_CLAIMS_REQUIRED", "WEB_PRINCIPAL_CLAIMS_INVALID"]); const code = error instanceof Error ? error.message : "UNAVAILABLE"; return known.has(code) ? code : "UNAVAILABLE"; }
async function awaitSearchParams(input: Promise<Record<string, string | string[] | undefined>>): Promise<URLSearchParams> { const values = await input; const params = new URLSearchParams(); for (const [key, value] of Object.entries(values)) if (typeof value === "string") params.set(key, value); return params; }
