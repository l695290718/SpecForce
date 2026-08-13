import { cookies } from "next/headers";
import { createGraphAnalysisRepository, createThreeAProjectionQueryService, PrismaThreeAQueryRepository, PrismaTraceContinuationStore, type ArchitectureGraphQueryProvider, type CursorKeyring } from "@specforge/knowledge-query";
import { handleThreeAQuery } from "../../../../../lib/3a/query-handler";
import { resolveThreeARequest, resolveWebAuthMode } from "../../../../../lib/3a/principal";
import { createWebThreeAQueryService } from "../../../../../lib/3a/service";
import { prisma } from "../../../../../lib/db";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  return handleThreeAQuery(request, {
    resolveRequest: (_request, architectureScope) => resolveThreeARequest({
      architectureScope,
      authMode: resolveWebAuthMode(),
      headers: request.headers,
      cookies: cookieStore
    }),
    createService: createWebThreeAQueryService,
    createGraphProvider: createRuntimeGraphProvider
  });
}

function createRuntimeGraphProvider(): ArchitectureGraphQueryProvider {
  return createThreeAProjectionQueryService(
    new PrismaThreeAQueryRepository(prisma),
    new PrismaTraceContinuationStore(prisma),
    readCursorKeyring(),
    undefined,
    createGraphAnalysisRepository(prisma)
  );
}

function readCursorKeyring(): CursorKeyring {
  const raw = process.env.SPECFORGE_3A_CURSOR_KEYS?.trim();
  if (!raw && process.env.SPECFORGE_MCP_SEED !== "1") throw new Error("THREE_A_CURSOR_KEY_REQUIRED");
  const activeKeyId = process.env.SPECFORGE_3A_CURSOR_ACTIVE_KEY_ID ?? "local-development";
  if (!raw) return { activeKeyId, keys: { [activeKeyId]: Buffer.from("specforge-local-development-cursor-key", "utf8") } };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("THREE_A_CURSOR_KEY_INVALID"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("THREE_A_CURSOR_KEY_INVALID");
  const keys = Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "string" && value.length > 0).map(([key, value]) => [key, Buffer.from(value as string, "base64")]));
  if (!keys[activeKeyId]) throw new Error("THREE_A_CURSOR_ACTIVE_KEY_REQUIRED");
  return { activeKeyId, keys };
}
