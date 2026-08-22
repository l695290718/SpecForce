"use client";

import { BookmarkPlus, Check, Link2, RotateCcw, Trash2 } from "lucide-react";
import React, { useEffect, useState } from "react";
import { T } from "../language-provider";

const STORAGE_KEY = "specforge.threeA.savedViews.v1";
const MAX_SAVED_VIEWS = 12;

export interface SavedGraphView {
  id: string;
  label: string;
  search: string;
}

export function readSavedViews(storage: Storage): SavedGraphView[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is SavedGraphView => Boolean(entry) && typeof entry === "object" && typeof (entry as SavedGraphView).id === "string" && typeof (entry as SavedGraphView).search === "string");
  } catch {
    return [];
  }
}

export function saveGraphView(storage: Storage, entry: SavedGraphView): SavedGraphView[] {
  const existing = readSavedViews(storage).filter((view) => view.search !== entry.search && view.id !== entry.id);
  const next = [entry, ...existing].slice(0, MAX_SAVED_VIEWS);
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function describeCurrentView(search: string): string {
  const params = new URLSearchParams(search);
  const parts = [params.get("graphView") ?? "overview", params.get("graphLayout") ?? "force"];
  if (params.get("focus")) parts.push("focus");
  if (Number(params.get("layers")?.split(",").filter(Boolean).length) > 0 || params.get("layers")?.trim()) parts.push("layers");
  return parts.filter(Boolean).join(" · ");
}

export function ArchitectureViewActions({ resetHref }: { resetHref: string }) {
  const [copied, setCopied] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedGraphView[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    try {
      setSavedViews(readSavedViews(window.localStorage));
    } catch {
      setSavedViews([]);
    }
  }, []);

  const shareView = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy the architecture view link", url);
    }
  };

  const persist = (views: SavedGraphView[]) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
    } catch {
      // Private-mode storage failures keep the in-memory list usable for this session.
    }
    setSavedViews(views);
  };

  const saveCurrentView = () => {
    const search = window.location.search.replace(/^\?/, "");
    const base = describeCurrentView(search);
    let suffix = 2;
    let label = base;
    while (savedViews.some((view) => view.label === label)) label = `${base} (${suffix++})`;
    persist(saveGraphView(window.localStorage, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, label, search }));
  };

  const applySavedView = (view: SavedGraphView) => {
    window.location.assign(`/architecture/3a${view.search ? `?${view.search}` : ""}`);
  };

  const buttonClass = "inline-flex h-9 items-center gap-1.5 rounded-md border border-white/15 bg-slate-950/85 px-3 text-xs font-semibold text-slate-200 shadow-panel transition hover:border-white/30 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-300";

  return <div className="flex items-center gap-2" data-testid="architecture-view-actions">
    <button className={buttonClass} data-testid="share-view-button" onClick={() => void shareView()} type="button">
      {copied ? <Check aria-hidden="true" size={14} className="text-emerald-300" /> : <Link2 aria-hidden="true" size={14} />}
      <T k={copied ? "threeA.linkCopied" : "threeA.shareView"} />
    </button>
    <div className="relative">
      <button aria-expanded={panelOpen} className={buttonClass} data-testid="saved-views-toggle" onClick={() => setPanelOpen((value) => !value)} type="button">
        <BookmarkPlus aria-hidden="true" size={14} />
        <T k="threeA.saveView" />
      </button>
      {panelOpen ? (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-md border border-border bg-white p-2 text-sm shadow-elevated">
          <div className="flex items-center justify-between gap-2 px-1 pb-2">
            <span className="text-xs font-bold uppercase tracking-wide text-muted"><T k="threeA.savedViews" /></span>
            <button className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-semibold text-ink hover:bg-chrome focus:outline-none focus:ring-2 focus:ring-blue-200" data-testid="save-current-view" onClick={() => { saveCurrentView(); }} type="button">
              <BookmarkPlus aria-hidden="true" size={12} />
              <T k="threeA.saveView" />
            </button>
          </div>
          {savedViews.length ? (
            <ul className="grid max-h-56 gap-1 overflow-auto">
              {savedViews.map((view) => (
                <li key={view.id} className="flex items-center gap-1 rounded px-1 hover:bg-chrome">
                  <button className="min-w-0 flex-1 truncate py-1.5 text-left font-mono text-xs text-ink focus:outline-none focus:ring-2 focus:ring-blue-200" data-testid={`apply-saved-view-${view.id}`} onClick={() => applySavedView(view)} title={view.label} type="button">{view.label}</button>
                  <button aria-label={`${view.label} delete`} className="rounded p-1.5 text-muted hover:bg-rose-50 hover:text-rose-700 focus:outline-none focus:ring-2 focus:ring-blue-200" data-testid={`delete-saved-view-${view.id}`} onClick={() => persist(savedViews.filter((item) => item.id !== view.id))} type="button"><Trash2 aria-hidden="true" size={13} /></button>
                </li>
              ))}
            </ul>
          ) : <p className="px-1 pb-1 text-xs text-muted" data-testid="no-saved-views"><T k="threeA.noSavedViews" /></p>}
        </div>
      ) : null}
    </div>
    <a className={buttonClass} data-testid="reset-view-link" href={resetHref}>
      <RotateCcw aria-hidden="true" size={14} />
      <T k="threeA.resetView" />
    </a>
  </div>;
}
