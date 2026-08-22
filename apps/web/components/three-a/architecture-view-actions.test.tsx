import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArchitectureViewActions, describeCurrentView, readSavedViews, saveGraphView } from "./architecture-view-actions";

vi.mock("../language-provider", () => ({ T: ({ k }: { k: string }) => k }));

function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    getLength: () => entries.size,
    key: () => null,
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, String(value)); },
    removeItem: (key: string) => { entries.delete(key); }
  } as unknown as Storage;
}

describe("saved architecture graph views", () => {
  it("persists saved views, dedupes by search string, and caps the list", () => {
    const storage = memoryStorage();
    saveGraphView(storage, { id: "a", label: "overview · force", search: "graphView=overview" });
    saveGraphView(storage, { id: "b", label: "impact · tree", search: "graphView=impact&graphLayout=tree" });
    saveGraphView(storage, { id: "c", label: "duplicate", search: "graphView=overview" });
    const views = readSavedViews(storage);
    expect(views.map((view) => view.id)).toEqual(["c", "b"]);
    for (let index = 0; index < 20; index += 1) saveGraphView(storage, { id: `extra-${index}`, label: `view ${index}`, search: `focus=${index}` });
    expect(readSavedViews(storage).length).toBeLessThanOrEqual(12);
  });

  it("returns an empty list for corrupt or absent storage payloads", () => {
    const storage = memoryStorage();
    expect(readSavedViews(storage)).toEqual([]);
    storage.setItem("specforge.threeA.savedViews.v1", "{not-json");
    expect(readSavedViews(storage)).toEqual([]);
    storage.setItem("specforge.threeA.savedViews.v1", JSON.stringify({ not: "an array" }));
    expect(readSavedViews(storage)).toEqual([]);
  });

  it("describes the current view from its URL parameters", () => {
    expect(describeCurrentView("?graphView=impact&graphLayout=tree")).toBe("impact · tree");
    expect(describeCurrentView("?graphView=explore&focus=fact%3Aabc")).toBe("explore · force · focus");
    expect(describeCurrentView("")).toBe("overview · force");
  });
});

describe("architecture view actions", () => {
  it("exposes share, saved-view, and reset controls with the reset href", () => {
    const markup = renderToStaticMarkup(<ArchitectureViewActions resetHref="/architecture/3a?graphView=overview" />);
    expect(markup).toContain('data-testid="share-view-button"');
    expect(markup).toContain('data-testid="saved-views-toggle"');
    expect(markup).toContain('data-testid="reset-view-link" href="/architecture/3a?graphView=overview"');
  });
});
