import type { DataModelGraphResponse } from "@specforge/core";

const DEFAULT_MAX_PAGES = 50;

export const DATA_MODEL_GRAPH_INITIAL_PAGE_SIZE = 200;
export const DATA_MODEL_GRAPH_CLIENT_CAPACITY = 5000;

export function shouldFetchDataModelGraph(view: string): boolean {
  return view === "er";
}

export interface CompleteDataModelGraphFetchOptions {
  query: string;
  headers: HeadersInit;
  fetchImpl?: typeof fetch;
  maxPages?: number;
}

export async function readCompleteDataModelGraph({ query, headers, fetchImpl = fetch, maxPages = DEFAULT_MAX_PAGES }: CompleteDataModelGraphFetchOptions): Promise<DataModelGraphResponse[]> {
  const pages: DataModelGraphResponse[] = [];
  let nextUrl = `/api/data-model-graph?${query}`;
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const result = await fetchImpl(nextUrl, { headers });
    const payload = await result.json() as DataModelGraphResponse | { error?: { code?: string } };
    if (!result.ok) throw new Error("error" in payload && payload.error?.code ? payload.error.code : "GRAPH_READ_FAILED");
    const page = payload as DataModelGraphResponse;
    const previous = pages[0];
    if (previous && (previous.waterlines.catalogDigest !== page.waterlines.catalogDigest || previous.waterlines.relationshipDigest !== page.waterlines.relationshipDigest)) throw new Error("SNAPSHOT_CHANGED");
    pages.push(page);
    if (!page.hasMore || !page.nextCursor) return pages;
    const params = new URLSearchParams(query);
    params.set("cursor", page.nextCursor);
    nextUrl = `/api/data-model-graph?${params.toString()}`;
  }
  throw new Error("GRAPH_PAGE_LIMIT_EXCEEDED");
}
