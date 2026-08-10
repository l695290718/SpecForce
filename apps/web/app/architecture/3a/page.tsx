import { headers } from "next/headers";
import { cookies } from "next/headers";
import { PageHeader } from "../../../components/ui";
import { T } from "../../../components/language-provider";
import { resolveThreeARequest } from "../../../lib/3a/principal";
import { createWebThreeAQueryService } from "../../../lib/3a/service";
import { parseThreeAUrlState, type ThreeAUrlState } from "../../../lib/3a/url-state";
import { scopeById } from "@specforge/core";
import type { ArchitectureScopeRef, KnowledgeProjectionEdge, KnowledgeProjectionNode, PublishedBaselineDrift } from "@specforge/core";
import type { PublishedBaselineSummary } from "@specforge/knowledge-query";
import { ThreeAWorkspace, type ThreeAWorkspaceData } from "../../../components/three-a/three-a-workspace";

export default async function ThreeAArchitecturePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const state = parseThreeAUrlState(await awaitSearchParams(searchParams));
  const scope = scopeById(state.scope);
  const scopeRef = scope && scope.level === "applicationService" ? { applicationServiceId: scope.id, scopePath: scope.scopePath } : undefined;
  const base = emptyData(state);
  if (!scopeRef) return <ThreeAFrame><ThreeAWorkspace data={{ ...base, errorCode: "SCOPE_ACCESS_DENIED" }} /></ThreeAFrame>;

  try {
    const request = await resolveThreeARequest({ architectureScope: scopeRef, authMode: process.env.NODE_ENV === "production" ? "production" : "seed", headers: await headers(), cookies: await cookies() });
    const service = createWebThreeAQueryService();
    const baselines = await service.listPublishedBaselines(request);
    const selectedBaseline = selectBaseline(baselines, state.baseline);
    const manifests = selectedBaseline ? await service.listProjectionManifests({ ...request, baselineId: selectedBaseline.id }) : [];
    const selectedManifest = manifests.find((manifest) => manifest.id === state.projection) ?? manifests[0];
    const activeState: ThreeAUrlState = { ...state, ...(selectedBaseline ? { baseline: selectedBaseline.id } : {}), ...(selectedManifest ? { projection: selectedManifest.id } : {}) };
    if (!selectedBaseline || !selectedManifest) return <ThreeAFrame><ThreeAWorkspace data={{ ...base, state: activeState, baselines: baselines.map(baselineOption), manifests: manifests.map(manifestOption) }} /></ThreeAFrame>;

    const search = await service.searchArchitectureFacts({ ...request, baselineId: selectedBaseline.id, projectionManifestId: selectedManifest.id, limit: 200 });
    const startAssertionId = state.focus ?? search.nodes[0]?.assertionId;
    const trace = startAssertionId ? await service.traceArchitecturePath({ ...request, baselineId: selectedBaseline.id, projectionManifestId: selectedManifest.id, startAssertionId, direction: state.direction }) : undefined;
    const alignment = await service.getArchitectureAlignment({ ...request, baselineId: selectedBaseline.id, projectionManifestId: selectedManifest.id });
    const drift = await loadDrift(service, request, selectedBaseline, baselines, selectedManifest.id);
    return <ThreeAFrame><ThreeAWorkspace data={{ state: activeState, nodes: search.nodes, edges: trace?.edges ?? [], alignmentEdges: alignment.edges, drift, baselines: baselines.map(baselineOption), manifests: manifests.map(manifestOption) }} /></ThreeAFrame>;
  } catch (error) {
    return <ThreeAFrame><ThreeAWorkspace data={{ ...base, errorCode: safeErrorCode(error) }} /></ThreeAFrame>;
  }
}

function ThreeAFrame({ children }: { children: React.ReactNode }) {
  return <><PageHeader title={<T k="threeA.title" />} description={<T k="threeA.description" />} /><section className="rounded-lg border border-slate-800 bg-slate-950 px-5 py-5 text-white shadow-elevated md:px-7"><div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><p className="font-mono text-[11px] font-semibold uppercase text-blue-300"><T k="threeA.eyebrow" /></p><h1 className="mt-2 text-2xl font-semibold"><T k="threeA.heroTitle" /></h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300"><T k="threeA.heroDescription" /></p></div><div className="grid grid-cols-3 gap-2 text-center text-xs"><span className="rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-amber-100"><strong className="block text-base">BIZ</strong><T k="threeA.business" /></span><span className="rounded-md border border-blue-300/20 bg-blue-300/10 px-3 py-2 text-blue-100"><strong className="block text-base">SYS</strong><T k="threeA.system" /></span><span className="rounded-md border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-emerald-100"><strong className="block text-base">TECH</strong><T k="threeA.technology" /></span></div></div></section><div className="mt-4">{children}</div></>;
}

function emptyData(state: ThreeAUrlState): ThreeAWorkspaceData { return { state, nodes: [], edges: [], alignmentEdges: [], baselines: [], manifests: [] }; }
function selectBaseline(baselines: PublishedBaselineSummary[], id?: string) { return baselines.find((baseline) => baseline.id === id) ?? baselines[0]; }
function baselineOption(baseline: PublishedBaselineSummary) { return { id: baseline.id, status: baseline.status, publishedAt: baseline.publishedAt }; }
function manifestOption(manifest: { id: string; profileVersion: string; publishedAt: string }) { return { id: manifest.id, profileVersion: manifest.profileVersion, publishedAt: manifest.publishedAt }; }
async function loadDrift(service: ReturnType<typeof createWebThreeAQueryService>, request: { architectureScope: ArchitectureScopeRef; principal: Parameters<ReturnType<typeof createWebThreeAQueryService>["getArchitectureAlignment"]>[0]["principal"] }, base: PublishedBaselineSummary, baselines: PublishedBaselineSummary[], baseManifestId: string): Promise<PublishedBaselineDrift | undefined> {
  const target = baselines.find((candidate) => candidate.id !== base.id);
  if (!target) return undefined;
  const targetManifests = await service.listProjectionManifests({ ...request, baselineId: target.id });
  const targetManifest = targetManifests[0];
  if (!targetManifest) return undefined;
  return service.comparePublishedBaselines({ ...request, baseBaselineId: base.id, targetBaselineId: target.id, baseProjectionManifestId: baseManifestId, targetProjectionManifestId: targetManifest.id });
}
function safeErrorCode(error: unknown): string { const known = new Set(["SCOPE_ACCESS_DENIED", "BASELINE_NOT_FOUND", "PROJECTION_MANIFEST_REQUIRED", "THREE_A_CURSOR_KEY_REQUIRED", "WEB_PRINCIPAL_RESOLVER_REQUIRED"]); const code = error instanceof Error ? error.message : "UNAVAILABLE"; return known.has(code) ? code : "UNAVAILABLE"; }
async function awaitSearchParams(input: Promise<Record<string, string | string[] | undefined>>): Promise<URLSearchParams> { const values = await input; const params = new URLSearchParams(); for (const [key, value] of Object.entries(values)) if (typeof value === "string") params.set(key, value); return params; }
