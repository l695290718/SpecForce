import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { contentDigest } from "@specforge/core";
import { ThreeAQueryError } from "./errors";
import type { ContinuationState } from "./types";

export interface SearchCursorPayload { version: 1; tenant: string; subject: string; scopeDigest: string; baselineId: string; projectionManifestId: string; filterDigest: string; sortKey: string; assertionId: string; expiresAt: string; keyId: string; }
export interface CursorKeyring { activeKeyId: string; keys: Record<string, Buffer>; }

export function signSearchCursor(payload: SearchCursorPayload, key: Buffer): string { const body = base64url(Buffer.from(JSON.stringify(payload), "utf8")); const signature = createHmac("sha256", key).update(body).digest("base64url"); return `${body}.${signature}`; }
export function verifySearchCursor(token: string, keyring: CursorKeyring, expected: Pick<SearchCursorPayload, "tenant" | "subject" | "scopeDigest" | "baselineId" | "projectionManifestId" | "filterDigest">, now = new Date()): SearchCursorPayload {
  try {
    const [body, signature] = token.split(".");
    if (!body || !signature) throw new Error();
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SearchCursorPayload;
    const key = keyring.keys[parsed.keyId];
    if (!key || parsed.version !== 1 || new Date(parsed.expiresAt).getTime() <= now.getTime()) throw new Error();
    const expectedSignature = createHmac("sha256", key).update(body).digest("base64url");
    if (signature.length !== expectedSignature.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) throw new Error();
    for (const keyName of ["tenant", "subject", "scopeDigest", "baselineId", "projectionManifestId", "filterDigest"] as const) if (parsed[keyName] !== expected[keyName]) throw new Error();
    if (!parsed.sortKey || !parsed.assertionId) throw new Error();
    return parsed;
  } catch { throw new ThreeAQueryError("CURSOR_INVALID"); }
}

export interface TraversalCursorPayload { version: 1; keyId: string; browseSessionId: string; sequence: number; tenant: string; subject: string; scopeDigest: string; baselineId: string; projectionManifestId: string; queryFingerprint: string; filterDigest: string; expiresAt: string; }
export function createTraversalCursor(state: Omit<ContinuationState, "browseSessionId" | "sequence">, keyring: CursorKeyring, sequence = 0): { token: string; browseSessionId: string; payload: TraversalCursorPayload } { const payload: TraversalCursorPayload = { version: 1, keyId: keyring.activeKeyId, browseSessionId: randomUUID(), sequence, tenant: state.tenantId, subject: state.subject, scopeDigest: contentDigest(state.architectureScope), baselineId: state.baselineId, projectionManifestId: state.projectionManifestId, queryFingerprint: state.queryFingerprint, filterDigest: state.queryFingerprint, expiresAt: state.expiresAt }; const key = keyring.keys[payload.keyId]; if (!key) throw new ThreeAQueryError("CURSOR_INVALID"); return { token: signSearchCursor(payload as unknown as SearchCursorPayload, key), browseSessionId: payload.browseSessionId, payload }; }
export function verifyTraversalCursor(token: string, keyring: CursorKeyring, expected: Pick<TraversalCursorPayload, "tenant" | "subject" | "scopeDigest" | "baselineId" | "projectionManifestId" | "queryFingerprint">, now = new Date()): TraversalCursorPayload { const payload = verifySearchCursor(token, keyring, { ...expected, filterDigest: expected.queryFingerprint }, now) as unknown as TraversalCursorPayload; if (!payload.browseSessionId || !Number.isInteger(payload.sequence)) throw new ThreeAQueryError("CURSOR_INVALID"); return payload; }
function base64url(value: Buffer): string { return value.toString("base64url"); }
