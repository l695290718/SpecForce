import React from "react";
import { AlertTriangle, CheckCircle2, Clock3, LockKeyhole } from "lucide-react";
import { T } from "../language-provider";

export function ProjectionStateBanner({ code, hasManifest }: { code?: string; hasManifest: boolean }) {
  if (code === "SCOPE_ACCESS_DENIED") return <Banner tone="danger" icon={<LockKeyhole size={16} />} titleKey="threeA.scopeDenied" detailKey="threeA.scopeDeniedDescription" />;
  if (code === "BASELINE_NOT_FOUND" || code === "PROJECTION_MANIFEST_REQUIRED") return <Banner tone="warning" icon={<AlertTriangle size={16} />} titleKey="threeA.noProjection" detailKey="threeA.noProjectionDescription" />;
  if (code) return <Banner tone="danger" icon={<AlertTriangle size={16} />} titleKey="threeA.unavailable" detailKey="threeA.unavailableDescription" />;
  if (!hasManifest) return <Banner tone="warning" icon={<Clock3 size={16} />} titleKey="threeA.noProjection" detailKey="threeA.noProjectionDescription" />;
  return <Banner tone="success" icon={<CheckCircle2 size={16} />} titleKey="threeA.projectionReady" detailKey="threeA.projectionReadyDescription" />;
}

function Banner({ tone, icon, titleKey, detailKey }: { tone: "danger" | "warning" | "success"; icon: React.ReactNode; titleKey: "threeA.scopeDenied" | "threeA.noProjection" | "threeA.unavailable" | "threeA.projectionReady"; detailKey: "threeA.scopeDeniedDescription" | "threeA.noProjectionDescription" | "threeA.unavailableDescription" | "threeA.projectionReadyDescription" }) {
  const styles = {
    danger: "border-rose-200 bg-rose-50 text-rose-900",
    warning: "border-amber-200 bg-amber-50 text-amber-950",
    success: "border-emerald-200 bg-emerald-50 text-emerald-950"
  };
  return <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${styles[tone]}`} role="status">
    <span className="mt-0.5 shrink-0">{icon}</span>
    <div><div className="font-semibold"><T k={titleKey} /></div><div className="mt-1 opacity-80"><T k={detailKey} /></div></div>
  </div>;
}
