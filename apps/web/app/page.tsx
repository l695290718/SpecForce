"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Database, FileCheck2, FileText, GitBranch, Network, Scale, ShieldCheck, Waypoints } from "lucide-react";
import { T } from "../components/language-provider";
import { overviewDestinations } from "../lib/overview";

const factFlow = [
  ["overview.flowProposal", FileText],
  ["overview.flowAdr", Scale],
  ["overview.flowAssets", Waypoints],
  ["overview.flowRules", ShieldCheck],
  ["overview.flowContextPack", Network],
  ["overview.flowEvidence", FileCheck2]
] as const;

const assetTypes = [
  "nav.apis",
  "nav.dataModels",
  "nav.events",
  "nav.rules",
  "nav.stateMachines",
  "nav.integrations",
  "nav.quality",
  "nav.observability"
] as const;

export default function ArchitectureOverviewPage() {
  const scope = useSearchParams().get("scope") ?? undefined;
  const destinations = overviewDestinations(scope);

  return (
    <div className="space-y-8 pb-4">
      <section className="sf-scan overflow-hidden rounded-lg border border-slate-700 bg-ink px-6 py-8 text-white shadow-elevated sm:px-8">
        <div className="max-w-4xl">
          <p className="font-mono text-[11px] font-semibold uppercase text-blue-200"><T k="overview.eyebrow" /></p>
          <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-normal sm:text-4xl"><T k="overview.title" /></h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-200"><T k="overview.description" /></p>
          <div className="mt-7 flex flex-wrap gap-3">
            <ActionLink href={destinations.workspace}><T k="overview.workspaceAction" /></ActionLink>
            <ActionLink href={destinations.graph} muted><T k="overview.graphAction" /></ActionLink>
            <ActionLink href={destinations.governance} muted><T k="overview.governanceAction" /></ActionLink>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="border-l-2 border-rule bg-panel px-5 py-5 shadow-panel">
          <div className="flex items-center gap-2 text-rule"><GitBranch size={18} /><h2 className="text-base font-semibold text-ink"><T k="overview.authoringTitle" /></h2></div>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted"><T k="overview.authoringDescription" /></p>
        </article>
        <article className="border-l-2 border-accent bg-panel px-5 py-5 shadow-panel">
          <div className="flex items-center gap-2 text-accent"><Database size={18} /><h2 className="text-base font-semibold text-ink"><T k="overview.storageTitle" /></h2></div>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted"><T k="overview.storageDescription" /></p>
        </article>
      </section>

      <section aria-label="Architecture concept map" className="border-y border-border py-7">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div><p className="font-mono text-[11px] font-semibold uppercase text-rule">SYSTEM OF DESIGN</p><h2 className="mt-2 text-xl font-semibold text-ink"><T k="overview.flowTitle" /></h2></div>
          <span className="hidden font-mono text-xs text-muted sm:block">MCP -&gt; PG -&gt; GRAPH</span>
        </div>
        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" data-testid="architecture-fact-flow">
          {factFlow.map(([labelKey, Icon], index) => (
            <li className="relative border border-border bg-white px-4 py-4 shadow-sm" key={labelKey}>
              <span className="font-mono text-[11px] font-semibold text-rule">0{index + 1}</span>
              <Icon className="mt-5 text-accent" size={20} />
              <div className="mt-3 text-sm font-semibold text-ink"><T k={labelKey} /></div>
              {index < factFlow.length - 1 ? <ArrowRight aria-hidden className="absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 bg-surface text-rule xl:block" size={16} /> : null}
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Architecture relationship map" className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase text-rule">TYPED LINKS</p>
          <h2 className="mt-2 text-xl font-semibold text-ink"><T k="overview.relationshipTitle" /></h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted"><T k="overview.relationshipDescription" /></p>
          <p className="mt-5 border-l-2 border-amber-400 pl-3 text-sm leading-6 text-muted"><T k="overview.scopeNotice" /></p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {assetTypes.map((labelKey, index) => (
            <div className="relative min-h-24 border border-border bg-panel px-3 py-3 shadow-sm" key={labelKey}>
              <span className="font-mono text-[11px] text-muted">{String(index + 1).padStart(2, "0")}</span>
              <div className="mt-4 text-sm font-semibold text-ink"><T k={labelKey} /></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ActionLink({ href, children, muted = false }: { href: string; children: React.ReactNode; muted?: boolean }) {
  return (
    <Link className={muted ? "inline-flex h-10 items-center gap-2 border border-white/25 px-4 text-sm font-semibold text-white transition hover:border-white hover:bg-white/10" : "inline-flex h-10 items-center gap-2 bg-white px-4 text-sm font-semibold text-ink transition hover:bg-blue-50"} href={href}>
      {children}<ArrowRight size={16} />
    </Link>
  );
}
