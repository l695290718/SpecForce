import ELK from "elkjs/lib/elk.bundled.js";
import { fromElkGraph, layoutErGraphWithFallback, toElkGraph, type ErLayoutRequest } from "./er-layout";

export interface ErLayoutWorkerRequest { type: "LAYOUT"; request: ErLayoutRequest; }
export interface ErLayoutWorkerResponse { type: "LAYOUT_RESULT"; result: ReturnType<typeof layoutErGraphWithFallback>; }

const elk = new ELK();

export async function runErLayout(request: ErLayoutRequest) {
  try {
    const result = await elk.layout(toElkGraph(request));
    return fromElkGraph(request, result);
  } catch (error) {
    return { ...layoutErGraphWithFallback(request), degraded: true, error: error instanceof Error ? error.message : "LAYOUT_DEGRADED" };
  }
}

if (typeof self !== "undefined") {
  self.onmessage = async (event: MessageEvent<ErLayoutWorkerRequest>) => {
    if (event.data?.type !== "LAYOUT") return;
    const result = await runErLayout(event.data.request);
    self.postMessage({ type: "LAYOUT_RESULT", result } satisfies ErLayoutWorkerResponse);
  };
}
