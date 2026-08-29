"use client";

import { Activity, Boxes, ClipboardList, FileCode2, Home, LayoutDashboard, ListChecks, LoaderCircle, Network, Search, Settings, Waypoints, ScanSearch } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { LanguageSwitcher, T } from "./language-provider";
import { ArchitectureScopeSwitcher } from "./architecture-scope-switcher";
import type { MessageKey } from "../lib/i18n";
import type { ResolvedApplicationServiceScope } from "../lib/scope";
import { buildScopedHref } from "../lib/scope";

const assetLinks = [
  ["nav.domains", "/assets/domains"],
  ["nav.dataModels", "/assets/data-models"],
  ["nav.apis", "/assets/apis"],
  ["nav.events", "/assets/events"],
  ["nav.rules", "/assets/rules"],
  ["nav.stateMachines", "/assets/state-machines"],
  ["nav.integrations", "/assets/integrations"],
  ["nav.quality", "/assets/quality"],
  ["nav.observability", "/assets/observability"],
  ["nav.briefing", "/governance/briefing"]
] as const;

export function AppShell({ children, readableScopes }: { children: ReactNode; readableScopes: ResolvedApplicationServiceScope[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scope = searchParams.get("scope");
  const withScope = (href: string) => scope ? buildScopedHref(href, scope) : href;
  const [isNavigating, setIsNavigating] = useState(false);
  const startNavigation = (href: string) => {
    if (window.location.pathname + window.location.search === href) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setIsNavigating(true);
    // A hard navigation is the reliable fallback for the production Docker build:
    // it cannot remain stuck in an App Router RSC transition when the server is healthy.
    window.setTimeout(() => window.location.assign(href), 0);
  };

  const handleInternalLinkClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a");
    if (!anchor || anchor.hasAttribute("download")) return;
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("data:")) return;
    const destination = new URL(href, window.location.href);
    if (destination.origin !== window.location.origin) return;
    const nextHref = `${destination.pathname}${destination.search}${destination.hash}`;
    if (window.location.pathname + window.location.search + window.location.hash === nextHref) return;
    event.preventDefault();
    event.stopPropagation();
    startNavigation(nextHref);
  };

  return (
    <div className="min-h-screen bg-surface" onClickCapture={handleInternalLinkClick}>
      <aside className="sf-deck fixed inset-y-0 left-0 hidden w-72 px-4 py-5 text-slate-200 shadow-deck lg:block">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-blue-400/40 to-transparent" />
        <div className="relative mb-5 overflow-hidden rounded-xl border border-white/10 bg-white/[0.06] p-3 shadow-elevated backdrop-blur">
          <div className="absolute inset-0 sf-hero-grid opacity-60" aria-hidden="true" />
          <div className="relative flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 font-mono text-sm font-bold text-white shadow-glow-strong">SF</div>
            <div>
              <div className="text-lg font-semibold leading-tight text-white">SpecForge</div>
              <div className="text-xs text-blue-200/85"><T k="app.subtitle" /></div>
            </div>
            <span className="ml-auto inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)] sf-pulse" aria-hidden="true" />
          </div>
        </div>
        <div className="mb-4 flex items-center justify-between gap-2">
          <LanguageSwitcher />
          <button
            className="flex h-8 items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.05] px-2.5 text-slate-300 transition hover:border-blue-300/40 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-300"
            title="Search"
            type="button"
          >
            <Search size={14} />
            <span className="hidden font-mono text-[10px] uppercase tracking-wider text-slate-500 xl:inline">Ctrl K</span>
          </button>
        </div>
        <nav className="space-y-1 text-sm">
          <NavItem href={withScope("/")} icon={<Home size={16} />} isActive={pathname === "/"} labelKey="nav.overview" onNavigate={startNavigation} />
          <NavItem href={withScope("/workspace")} icon={<LayoutDashboard size={16} />} isActive={pathname === "/workspace"} labelKey="nav.workspace" onNavigate={startNavigation} />
          <NavItem href={withScope("/architecture/3a")} icon={<Waypoints size={16} />} isActive={pathname.startsWith("/architecture/3a")} labelKey="nav.threeA" onNavigate={startNavigation} />
          <div className="px-3 pt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500"><T k="nav.designAssets" /></div>
          {assetLinks.map(([labelKey, href]) => <NavItem href={withScope(href)} icon={<Boxes size={16} />} isActive={pathname.startsWith(href)} key={href} labelKey={labelKey} onNavigate={startNavigation} />)}
          <NavItem href={withScope("/assets/adrs")} icon={<FileCode2 size={16} />} isActive={pathname.startsWith("/assets/adrs")} labelKey="nav.adrs" onNavigate={startNavigation} />
          <div className="px-3 pt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500"><T k="nav.workflows" /></div>
          <NavItem href={withScope("/proposals")} icon={<ClipboardList size={16} />} isActive={pathname.startsWith("/proposals")} labelKey="nav.proposals" onNavigate={startNavigation} />
          <NavItem href={withScope("/context-packs")} icon={<Activity size={16} />} isActive={pathname.startsWith("/context-packs")} labelKey="nav.contextPacks" onNavigate={startNavigation} />
          <NavItem href={withScope("/requirement-assessment")} icon={<ScanSearch size={16} />} isActive={pathname.startsWith("/requirement-assessment")} labelKey="nav.assessments" onNavigate={startNavigation} />
          <NavItem href={withScope("/graph")} icon={<Network size={16} />} isActive={pathname.startsWith("/graph")} labelKey="nav.graph" onNavigate={startNavigation} />
          <NavItem href={withScope("/governance/checks")} icon={<ListChecks size={16} />} isActive={pathname.startsWith("/governance")} labelKey="nav.governance" onNavigate={startNavigation} />
          <NavItem href={withScope("/settings")} icon={<Settings size={16} />} isActive={pathname.startsWith("/settings")} labelKey="nav.settings" onNavigate={startNavigation} />
        </nav>
      </aside>
      <main className="lg:pl-72">
        <div className="sticky top-0 z-20 border-b border-border/70 bg-white/72 px-5 backdrop-blur-xl lg:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-gradient-to-br from-blue-500 to-violet-500 shadow-glow sf-pulse" aria-hidden="true" />
              <T k="app.name" />
            </div>
            <nav aria-label="Quick navigation" className="flex items-center gap-1 text-xs font-semibold text-slate-500 lg:hidden">
              {([["nav.overview", "/"], ["nav.workspace", "/workspace"], ["nav.threeA", "/architecture/3a"], ["nav.dataModels", "/assets/data-models"], ["nav.governance", "/governance/checks"]] as const).map(([labelKey, href]) => (
                <Link key={href} className={`rounded-md px-2 py-1.5 transition hover:bg-slate-900/[0.05] hover:text-ink ${pathname === href ? "bg-slate-900/[0.06] text-accent" : ""}`} href={withScope(href)} onClick={(event) => { event.preventDefault(); startNavigation(withScope(href)); }}><T k={labelKey} /></Link>
              ))}
            </nav>
            <div className="flex min-w-0 items-center gap-3">
              <ArchitectureScopeSwitcher readableScopes={readableScopes} />
              <div className="hidden font-mono text-[11px] uppercase tracking-wider text-muted md:block"><T k="app.topline" /></div>
            </div>
          </div>
          <div className="sf-hairline absolute inset-x-0 bottom-[-1px] h-px" aria-hidden="true" />
        </div>
        <div className="mx-auto max-w-7xl px-5 py-6 lg:px-8">{children}</div>
      </main>
      {isNavigating ? <div aria-busy="true" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-50" role="status"><div className="h-1 animate-pulse bg-gradient-to-r from-blue-500 via-violet-500 to-blue-500" /><div className="absolute right-4 top-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-lg backdrop-blur"><LoaderCircle className="animate-spin text-accent" size={14} aria-hidden="true" /><T k="nav.loading" /></div></div> : null}
    </div>
  );
}

function NavItem({ href, icon, isActive, labelKey, onNavigate }: { href: string; icon: ReactNode; isActive: boolean; labelKey: MessageKey; onNavigate?: (href: string) => void }) {
  const handleClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (window.location.pathname + window.location.search === href) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (onNavigate) {
      event.preventDefault();
      onNavigate(href);
    }
  };
  if (isActive) {
    return (
      <Link
        className="group relative flex items-center gap-2 rounded-lg bg-white/[0.09] px-3 py-2 font-semibold text-white ring-1 ring-inset ring-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_6px_18px_rgba(37,99,235,0.22)] transition"
        href={href}
        onClick={handleClick}
      >
        <span aria-hidden="true" className="absolute -left-4 h-5 w-1 rounded-full bg-gradient-to-b from-blue-400 to-violet-500 shadow-[0_0_12px_rgba(99,102,241,0.9)]" />
        <span className="text-blue-300">{icon}</span>
        <span><T k={labelKey} /></span>
      </Link>
    );
  }
  return (
    <Link
      className="group flex items-center gap-2 rounded-lg px-3 py-2 text-slate-300 transition hover:translate-x-1 hover:bg-white/[0.06] hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-300"
      href={href}
      onClick={handleClick}
    >
      <span className="text-slate-500 transition group-hover:text-blue-300">{icon}</span>
      <span><T k={labelKey} /></span>
    </Link>
  );
}
