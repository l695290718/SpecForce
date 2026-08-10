"use client";

import { RefreshCw } from "lucide-react";
import { T } from "../../../components/language-provider";

export default function ThreeAError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center"><h1 className="text-lg font-semibold text-rose-900"><T k="threeA.unavailable" /></h1><p className="mt-2 text-sm text-rose-800"><T k="threeA.unavailableDescription" /></p><button className="mt-4 inline-flex items-center gap-2 rounded-md bg-rose-700 px-3 py-2 text-sm font-semibold text-white" onClick={reset} type="button"><RefreshCw size={15} /><T k="threeA.retry" /></button></div>;
}
