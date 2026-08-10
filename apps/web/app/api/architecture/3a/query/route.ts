import { cookies } from "next/headers";
import { handleThreeAQuery } from "../../../../../lib/3a/query-handler";
import { resolveThreeARequest } from "../../../../../lib/3a/principal";
import { createWebThreeAQueryService } from "../../../../../lib/3a/service";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  return handleThreeAQuery(request, {
    resolveRequest: (_request, architectureScope) => resolveThreeARequest({
      architectureScope,
      authMode: process.env.NODE_ENV === "production" ? "production" : "seed",
      headers: request.headers,
      cookies: cookieStore
    }),
    createService: createWebThreeAQueryService
  });
}
