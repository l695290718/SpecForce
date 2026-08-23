import { PrismaClient } from "@prisma/client";
import { createGraphAnalysisRepository, createThreeAProjectionQueryService, PrismaThreeAQueryRepository, PrismaTraceContinuationStore, type ThreeAProjectionQueryService } from "@specforge/knowledge-query";
import type { CursorKeyring } from "@specforge/knowledge-query";
import { prisma as defaultPrisma } from "../db";

export interface ThreeAQueryServiceOptions {
  prisma?: PrismaClient;
  keyring?: CursorKeyring;
  now?: () => Date;
}

export function createWebThreeAQueryService(options: ThreeAQueryServiceOptions = {}): ThreeAProjectionQueryService {
  return createThreeAProjectionQueryService(
    new PrismaThreeAQueryRepository(options.prisma ?? defaultPrisma),
    new PrismaTraceContinuationStore(options.prisma ?? defaultPrisma),
    options.keyring ?? readCursorKeyring(),
    options.now,
    createGraphAnalysisRepository(options.prisma ?? defaultPrisma)
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
