import { LoaderCircle } from "lucide-react";
import { T } from "../components/language-provider";

export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4" role="status">
      <div className="sf-deck relative h-32 overflow-hidden rounded-xl border border-white/10 p-6 shadow-deck">
        <div className="absolute inset-0 sf-hero-grid opacity-60" aria-hidden="true" />
        <div className="relative flex items-center gap-3">
          <LoaderCircle className="animate-spin text-blue-300" size={20} aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-200"><T k="nav.loading" /></p>
        </div>
      </div>
      <div className="h-14 animate-pulse rounded-xl border border-border/70 bg-white/70" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-40 animate-pulse rounded-xl border border-border/70 bg-white/70" />
        <div className="h-40 animate-pulse rounded-xl border border-border/70 bg-white/70" />
        <div className="h-40 animate-pulse rounded-xl border border-border/70 bg-white/70" />
      </div>
    </div>
  );
}
