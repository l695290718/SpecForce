"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, Database, FileCheck2, FileText, GitBranch, Network, Scale, ShieldCheck, Waypoints } from "lucide-react";
import { T, useLanguage } from "../components/language-provider";
import { overviewDestinations } from "../lib/overview";

const factFlow = [
  ["overview.change", GitBranch],
  ["overview.flowProposal", FileText],
  ["overview.flowAdr", Scale],
  ["overview.flowAssets", Waypoints],
  ["overview.flowRules", ShieldCheck],
  ["overview.governance", ShieldCheck],
  ["overview.flowContextPack", Network],
  ["overview.flowEvidence", FileCheck2]
] as const;

const explanationSections = [
  {
    titleKey: "overview.authoringTitle",
    descriptionKey: "overview.authoringDescription",
    Icon: GitBranch,
    accentClassName: "text-rule",
    borderClassName: "border-rule"
  },
  {
    titleKey: "overview.ownershipTitle",
    descriptionKey: "overview.ownershipDescription",
    Icon: ShieldCheck,
    accentClassName: "text-amber-500",
    borderClassName: "border-amber-400"
  },
  {
    titleKey: "overview.projectionTitle",
    descriptionKey: "overview.projectionDescription",
    Icon: Database,
    accentClassName: "text-accent",
    borderClassName: "border-accent"
  }
] as const;

const relationshipNodes = [
  { id: "apis", labelKey: "nav.apis" },
  { id: "dataModels", labelKey: "nav.dataModels" },
  { id: "events", labelKey: "nav.events" },
  { id: "rules", labelKey: "nav.rules" },
  { id: "stateMachines", labelKey: "nav.stateMachines" },
  { id: "integrations", labelKey: "nav.integrations" },
  { id: "quality", labelKey: "nav.quality" },
  { id: "observability", labelKey: "nav.observability" }
] as const;

const relationshipEdges = [
  {
    id: "data-model-shapes-api",
    from: "dataModels",
    to: "apis",
    fromKey: "nav.dataModels",
    toKey: "nav.apis",
    typeKey: "overview.edgeShapes",
    descriptionKey: "overview.edgeShapesDescription"
  },
  {
    id: "rules-constrain-api",
    from: "rules",
    to: "apis",
    fromKey: "nav.rules",
    toKey: "nav.apis",
    typeKey: "overview.edgeConstrains",
    descriptionKey: "overview.edgeConstrainsDescription"
  },
  {
    id: "api-emits-event",
    from: "apis",
    to: "events",
    fromKey: "nav.apis",
    toKey: "nav.events",
    typeKey: "overview.edgeEmits",
    descriptionKey: "overview.edgeEmitsDescription"
  },
  {
    id: "state-machine-drives-event",
    from: "stateMachines",
    to: "events",
    fromKey: "nav.stateMachines",
    toKey: "nav.events",
    typeKey: "overview.edgeDrives",
    descriptionKey: "overview.edgeDrivesDescription"
  },
  {
    id: "rules-guard-state",
    from: "rules",
    to: "stateMachines",
    fromKey: "nav.rules",
    toKey: "nav.stateMachines",
    typeKey: "overview.edgeGuards",
    descriptionKey: "overview.edgeGuardsDescription"
  },
  {
    id: "integration-depends-api",
    from: "integrations",
    to: "apis",
    fromKey: "nav.integrations",
    toKey: "nav.apis",
    typeKey: "overview.edgeDependsOn",
    descriptionKey: "overview.edgeDependsOnDescription"
  },
  {
    id: "quality-verifies-api",
    from: "quality",
    to: "apis",
    fromKey: "nav.quality",
    toKey: "nav.apis",
    typeKey: "overview.edgeVerifies",
    descriptionKey: "overview.edgeVerifiesDescription"
  },
  {
    id: "observability-observes-event",
    from: "observability",
    to: "events",
    fromKey: "nav.observability",
    toKey: "nav.events",
    typeKey: "overview.edgeObserves",
    descriptionKey: "overview.edgeObservesDescription"
  }
] as const;

type RelationshipNodeId = (typeof relationshipNodes)[number]["id"];
type RelationshipEdgeId = (typeof relationshipEdges)[number]["id"];
type HighlightState = { nodeId?: RelationshipNodeId; relationId?: RelationshipEdgeId } | null;

export default function ArchitectureOverviewPage() {
  const { t } = useLanguage();
  const scope = useSearchParams().get("scope") ?? undefined;
  const destinations = overviewDestinations(scope);
  const [activeHighlight, setActiveHighlight] = useState<HighlightState>(null);

  const activeEdge = relationshipEdges.find((edge) => edge.id === activeHighlight?.relationId);
  const highlightedRelationIds = new Set(
    activeHighlight?.relationId
      ? [activeHighlight.relationId]
      : activeHighlight?.nodeId
        ? relationshipEdges
          .filter((edge) => edge.from === activeHighlight.nodeId || edge.to === activeHighlight.nodeId)
          .map((edge) => edge.id)
        : []
  );
  const highlightedNodeIds = new Set<RelationshipNodeId>(
    activeHighlight?.relationId && activeEdge
      ? [activeEdge.from, activeEdge.to]
      : activeHighlight?.nodeId
        ? relationshipEdges
          .filter((edge) => edge.from === activeHighlight.nodeId || edge.to === activeHighlight.nodeId)
          .flatMap((edge) => [edge.from, edge.to])
        : []
  );

  if (activeHighlight?.nodeId) {
    highlightedNodeIds.add(activeHighlight.nodeId);
  }

  const hasActiveHighlight = highlightedNodeIds.size > 0 || highlightedRelationIds.size > 0;

  return (
    <div className="space-y-8 pb-4">
      <section className="sf-scan sf-overview-canvas overflow-hidden rounded-lg border border-slate-700 px-6 py-8 text-white shadow-elevated sm:px-8" data-testid="architecture-introduction-canvas">
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

      <section aria-labelledby="architecture-concepts-title" className="space-y-4">
        <h2 className="text-xl font-semibold text-ink" id="architecture-concepts-title"><T k="overview.conceptsTitle" /></h2>
        <div className="grid gap-4 xl:grid-cols-3">
          {explanationSections.map(({ titleKey, descriptionKey, Icon, accentClassName, borderClassName }) => (
            <article className={`border-l-2 bg-panel px-5 py-5 shadow-panel ${borderClassName}`} key={titleKey}>
              <div className={`flex items-center gap-2 ${accentClassName}`}>
                <Icon size={18} />
                <h3 className="text-base font-semibold text-ink"><T k={titleKey} /></h3>
              </div>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted"><T k={descriptionKey} /></p>
            </article>
          ))}
        </div>
      </section>

      <section aria-label={t("overview.flowAriaLabel")} className="border-y border-border py-7">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-ink"><T k="overview.flowTitle" /></h2>
            <p className="mt-2 text-sm text-muted"><T k="overview.flowCaption" /></p>
          </div>
          <span className="hidden font-mono text-xs text-muted sm:block">{t("overview.flowLegend")}</span>
        </div>
        <ol className="sf-overview-flow" data-testid="architecture-fact-flow">
          {factFlow.map(([labelKey, Icon], index) => (
            <li className="sf-overview-flow-step sf-overview-stage relative border border-border bg-white px-4 py-4 shadow-sm" data-motion key={labelKey} style={{ "--stage-delay": `${index * 80}ms` } as CSSProperties}>
              <span className="font-mono text-[11px] font-semibold text-rule">0{index + 1}</span>
              <Icon className="mt-5 text-accent" size={20} />
              <div className="mt-3 text-sm font-semibold text-ink"><T k={labelKey} /></div>
              {index < factFlow.length - 1 ? <ArrowRight aria-hidden className="sf-overview-flow-connector absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 bg-surface text-rule xl:block" data-motion size={16} /> : null}
            </li>
          ))}
        </ol>
      </section>

      <section aria-label={t("overview.relationshipAriaLabel")} className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase text-rule">{t("overview.relationshipEyebrow")}</p>
          <h2 className="mt-2 text-xl font-semibold text-ink"><T k="overview.relationshipTitle" /></h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted"><T k="overview.relationshipDescription" /></p>
          <p className="mt-5 border-l-2 border-amber-400 pl-3 text-sm leading-6 text-muted"><T k="overview.scopeNotice" /></p>
        </div>
        <figure aria-label="Architecture relationship constellation" className="sf-relationship-constellation" data-has-active={hasActiveHighlight ? "true" : "false"}>
          <figcaption className="border-b border-border/80 px-4 py-4 sm:px-5">
            <h3 className="text-sm font-semibold text-ink"><T k="overview.relationshipLegendTitle" /></h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted"><T k="overview.relationshipLegendDescription" /></p>
          </figcaption>
          <div className="px-4 py-4 sm:px-5">
            <ul className="sf-overview-asset-constellation sf-relationship-grid" data-testid="architecture-asset-constellation" role="list">
              {relationshipNodes.map((node, index) => {
                const isHighlighted = highlightedNodeIds.has(node.id);

                return (
                  <li key={node.id}>
                    <button
                      aria-label={t(node.labelKey)}
                      aria-pressed={isHighlighted}
                      className="sf-overview-asset-node sf-relationship-node"
                      data-highlighted={isHighlighted ? "true" : "false"}
                      onBlur={() => setActiveHighlight(null)}
                      onClick={() => setActiveHighlight({ nodeId: node.id })}
                      onFocus={() => setActiveHighlight({ nodeId: node.id })}
                      onMouseEnter={() => setActiveHighlight({ nodeId: node.id })}
                      onMouseLeave={() => setActiveHighlight(null)}
                      type="button"
                    >
                      <span className="font-mono text-[11px] text-muted">{String(index + 1).padStart(2, "0")}</span>
                      <span className="mt-4 block text-sm font-semibold text-ink"><T k={node.labelKey} /></span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <ol className="sf-relationship-edge-list" data-testid="typed-relationship-list">
              {relationshipEdges.map((edge) => {
                const isHighlighted = highlightedRelationIds.has(edge.id);

                return (
                  <li key={edge.id}>
                    <button
                      aria-label={[t(edge.fromKey), t(edge.typeKey), t(edge.toKey)].join(" ")}
                      aria-pressed={isHighlighted}
                      className="sf-relationship-edge-button"
                      data-highlighted={isHighlighted ? "true" : "false"}
                      onBlur={() => setActiveHighlight(null)}
                      onClick={() => setActiveHighlight({ relationId: edge.id })}
                      onFocus={() => setActiveHighlight({ relationId: edge.id })}
                      onMouseEnter={() => setActiveHighlight({ relationId: edge.id })}
                      onMouseLeave={() => setActiveHighlight(null)}
                      type="button"
                    >
                      <span className="sf-relationship-edge-route">
                        <span className="text-ink"><T k={edge.fromKey} /></span>
                        <span aria-hidden className="text-muted">{"->"}</span>
                        <span className="sf-relationship-edge-type"><T k={edge.typeKey} /></span>
                        <span aria-hidden className="text-muted">{"->"}</span>
                        <span className="text-ink"><T k={edge.toKey} /></span>
                      </span>
                      <span className="mt-2 block text-left text-sm leading-6 text-muted"><T k={edge.descriptionKey} /></span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </figure>
      </section>
    </div>
  );
}

function ActionLink({ href, children, muted = false }: { href: string; children: ReactNode; muted?: boolean }) {
  return (
    <Link className={muted ? "inline-flex h-10 items-center gap-2 border border-white/25 px-4 text-sm font-semibold text-white transition hover:border-white hover:bg-white/10" : "inline-flex h-10 items-center gap-2 bg-white px-4 text-sm font-semibold text-ink transition hover:bg-blue-50"} href={href}>
      {children}<ArrowRight size={16} />
    </Link>
  );
}
