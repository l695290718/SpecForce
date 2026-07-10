"use client";

import { Search } from "lucide-react";
import { useLanguage } from "./language-provider";

export function LocalizedSearchInput({ defaultValue }: { defaultValue: string }) {
  const { t } = useLanguage();
  return (
    <div className="relative w-full md:max-w-xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
      <input className="h-10 w-full rounded-md border border-border bg-white pl-9 pr-3 text-sm shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-blue-100" name="q" placeholder={t("asset.searchPlaceholder")} defaultValue={defaultValue} />
    </div>
  );
}
