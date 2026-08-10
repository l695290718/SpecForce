import { T } from "../../../components/language-provider";

export default function LoadingThreeA() {
  return <div className="space-y-4" aria-busy="true"><div className="h-32 animate-pulse rounded-lg bg-slate-200" /><div className="h-16 animate-pulse rounded-lg bg-slate-200" /><div className="grid h-[clamp(32rem,calc(100dvh-16rem),48rem)] min-h-0 gap-4 lg:grid-cols-3"><div className="h-full animate-pulse rounded-lg bg-slate-200" /><div className="h-full animate-pulse rounded-lg bg-slate-200" /><div className="h-full animate-pulse rounded-lg bg-slate-200" /></div><p className="text-center text-sm text-muted"><T k="threeA.loading" /></p></div>;
}
