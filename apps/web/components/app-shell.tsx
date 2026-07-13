"use client";

import { Activity, Boxes, ClipboardList, FileCode2, Home, ListChecks, Network, Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { LanguageSwitcher, T } from "./language-provider";
import { ArchitectureScopeSwitcher } from "./architecture-scope-switcher";
import type { MessageKey } from "../lib/i18n";

const assetLinks = [
  ["nav.domains", "/assets/domains"],
  ["nav.dataModels", "/assets/data-models"],
  ["nav.apis", "/assets/apis"],
  ["nav.events", "/assets/events"],
  ["nav.rules", "/assets/rules"],
  ["nav.stateMachines", "/assets/state-machines"],
  ["nav.integrations", "/assets/integrations"],
  ["nav.quality", "/assets/quality"],
  ["nav.observability", "/assets/observability"]
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scope = searchParams.get("scope");
  const withScope = (href: string) => scope ? `${href}${href.includes("?") ? "&" : "?"}scope=${encodeURIComponent(scope)}` : href;

  return (
    <div className="min-h-screen bg-surface">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-border bg-white/92 px-4 py-5 shadow-[8px_0_28px_rgba(16,24,40,0.06)] backdrop-blur lg:block">
        <div className="sf-scan mb-5 rounded-lg border border-blue-100 bg-gradient-to-br from-slate-950 to-slate-800 px-3 py-3 text-white shadow-elevated">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-white font-mono text-sm font-bold text-ink">SF</div>
            <div>
              <div className="text-lg font-semibold leading-tight">SpecForge</div>
              <div className="text-xs text-blue-100"><T k="app.subtitle" /></div>
            </div>
          </div>
        </div>
        <div className="mb-4 flex items-center justify-between gap-2">
          <LanguageSwitcher />
          <div className="grid h-8 w-8 place-items-center rounded-md border border-border text-muted" title="Search">
            <Search size={15} />
          </div>
        </div>
        <nav className="space-y-1 border-l border-border pl-2 text-sm">
          <NavItem href={withScope("/")} icon={<Home size={16} />} isActive={pathname === "/"} labelKey="nav.dashboard" />
          <div className="px-3 pt-4 text-xs font-semibold uppercase text-muted"><T k="nav.designAssets" /></div>
          {assetLinks.map(([labelKey, href]) => <NavItem href={withScope(href)} icon={<Boxes size={16} />} isActive={pathname.startsWith(href)} key={href} labelKey={labelKey} />)}
          <NavItem href={withScope("/assets/adrs")} icon={<FileCode2 size={16} />} isActive={pathname.startsWith("/assets/adrs")} labelKey="nav.adrs" />
          <div className="px-3 pt-4 text-xs font-semibold uppercase text-muted"><T k="nav.workflows" /></div>
          <NavItem href={withScope("/proposals")} icon={<ClipboardList size={16} />} isActive={pathname.startsWith("/proposals")} labelKey="nav.proposals" />
          <NavItem href={withScope("/context-packs")} icon={<Activity size={16} />} isActive={pathname.startsWith("/context-packs")} labelKey="nav.contextPacks" />
          <NavItem href={withScope("/graph")} icon={<Network size={16} />} isActive={pathname.startsWith("/graph")} labelKey="nav.graph" />
          <NavItem href={withScope("/governance/checks")} icon={<ListChecks size={16} />} isActive={pathname.startsWith("/governance")} labelKey="nav.governance" />
          <NavItem href={withScope("/settings")} icon={<Settings size={16} />} isActive={pathname.startsWith("/settings")} labelKey="nav.settings" />
        </nav>
      </aside>
      <main className="lg:pl-72">
        <div className="sticky top-0 z-20 border-b border-border bg-surface/90 px-5 py-3 backdrop-blur lg:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <span className="sf-pulse h-2 w-2 rounded-sm bg-rule" />
              <T k="app.name" />
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <ArchitectureScopeSwitcher />
              <div className="hidden font-mono text-[11px] uppercase text-muted md:block"><T k="app.topline" /></div>
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-5 py-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}

function NavItem({ href, icon, isActive, labelKey }: { href: string; icon: ReactNode; isActive: boolean; labelKey: MessageKey }) {
  return (
    <Link className={isActive ? "group relative flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 font-semibold text-ink shadow-sm ring-1 ring-blue-100 transition" : "group flex items-center gap-2 rounded-md px-3 py-2 text-slate-700 transition hover:translate-x-1 hover:bg-surface hover:text-ink"} href={href}>
      {isActive ? <span className="absolute -left-[9px] h-5 w-1 rounded-full bg-accent" /> : null}
      <span className={isActive ? "text-accent" : "text-slate-400 transition group-hover:text-accent"}>{icon}</span>
      <span><T k={labelKey} /></span>
    </Link>
  );
}
