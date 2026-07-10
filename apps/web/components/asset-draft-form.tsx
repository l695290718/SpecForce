"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "./language-provider";

interface AssetDraftFormProps {
  assetType: string;
  routeType: string;
  initialAsset?: Record<string, unknown>;
}

export function AssetDraftForm({ assetType, routeType, initialAsset }: AssetDraftFormProps) {
  const { t } = useLanguage();
  const initialJson = useMemo(
    () =>
      JSON.stringify(
        initialAsset ?? {
          id: `${assetType}-draft-${Date.now()}`,
          name: "",
          description: "",
          domainId: "domain-order",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        null,
        2
      ),
    [assetType, initialAsset]
  );
  const [json, setJson] = useState(initialJson);
  const [status, setStatus] = useState<string>(() => t("asset.draftInitialStatus"));
  const [error, setError] = useState<string | null>(null);

  const saveDraft = () => {
    try {
      const parsed = JSON.parse(json) as { id?: string };
      const draftId = parsed.id ?? `${assetType}-draft`;
      window.localStorage.setItem(`specforge-draft:${assetType}:${draftId}`, json);
      setError(null);
      setStatus(`${t("asset.draftSavedPrefix")} ${draftId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("asset.invalidJson"));
    }
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 rounded-lg border border-border bg-panel p-5 shadow-panel">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold">{t("asset.draftJson")}</h2>
            <p className="mt-1 text-sm text-muted">{status}</p>
          </div>
          <div className="flex gap-2">
            <button className="h-9 rounded-md bg-accent px-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200" onClick={saveDraft} type="button">
              {t("action.saveDraft")}
            </button>
            <Link className="inline-flex h-9 items-center rounded-md border border-border bg-white px-3 text-sm font-medium text-slate-700 hover:bg-surface" href={`/assets/${routeType}`}>
              {t("action.backToList")}
            </Link>
          </div>
        </div>
        {error ? <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
        <textarea
          className="min-h-[520px] w-full rounded-md border border-border bg-slate-950 p-4 font-mono text-xs text-slate-50 outline-none focus:ring-2 focus:ring-blue-100"
          onChange={(event) => setJson(event.target.value)}
          spellCheck={false}
          value={json}
        />
      </div>
    </div>
  );
}
