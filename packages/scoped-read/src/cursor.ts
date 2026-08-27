import { createHmac, timingSafeEqual } from "node:crypto";
import type { ArchitectureScopeRef } from "@specforge/core";
import type { ReadLocale, ReadOrderKey } from "./types";

const READ_CURSOR_VERSION = 1 as const;
const DEFAULT_CURSOR_SECRET = "specforge-local-read-cursor-secret";

export type ReadCursorPayload = {
  version: typeof READ_CURSOR_VERSION;
  subject: string;
  architectureScope: ArchitectureScopeRef;
  locale: ReadLocale;
  queryDigest: string;
  catalogVersion: string;
  projectionVersion?: string;
  orderKey: ReadOrderKey;
};

export type ReadCursorBinding = {
  subject: string;
  architectureScope: ArchitectureScopeRef;
  locale: ReadLocale;
  queryDigest: string;
  catalogVersion: string;
  projectionVersion?: string;
};

export type ReadCursorValidation = ReadCursorBinding;

export function encodeReadCursor(payload: ReadCursorPayload, secret = cursorSecret()): string {
  assertPayload(payload);
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(body, secret);
  return `${body}.${signature}`;
}

export function decodeReadCursor(token: string, expected: ReadCursorBinding, secret = cursorSecret()): ReadCursorPayload {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) throw new Error("malformed cursor");
    const [body, signature] = parts;
    if (!body || !signature || !isBase64Url(body) || !isBase64Url(signature)) throw new Error("malformed cursor");

    const expectedSignature = sign(body, secret);
    if (!safeEqual(signature, expectedSignature)) throw new Error("invalid signature");

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as unknown;
    assertPayload(payload);
    assertBinding(payload, expected);
    return payload;
  } catch (error) {
    if (error instanceof CursorStaleError) throw error;
    throw new ReadCursorError("CURSOR_INVALID");
  }
}

export class ReadCursorError extends Error {
  constructor(public readonly code: "CURSOR_INVALID" | "CURSOR_STALE") {
    super(code);
    this.name = "ReadCursorError";
  }
}

class CursorStaleError extends ReadCursorError {
  constructor() {
    super("CURSOR_STALE");
  }
}

function cursorSecret(): string {
  return process.env.SPECFORGE_READ_CURSOR_SECRET ?? DEFAULT_CURSOR_SECRET;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isBase64Url(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/u.test(value);
}

function assertPayload(value: unknown): asserts value is ReadCursorPayload {
  if (!isRecord(value) || value.version !== READ_CURSOR_VERSION || typeof value.subject !== "string" || !value.subject || !isScope(value.architectureScope) || !isLocale(value.locale) || typeof value.queryDigest !== "string" || !value.queryDigest || typeof value.catalogVersion !== "string" || !value.catalogVersion || (value.projectionVersion !== undefined && (typeof value.projectionVersion !== "string" || !value.projectionVersion)) || !isOrderKey(value.orderKey)) {
    throw new Error("invalid payload");
  }
}

function assertBinding(payload: ReadCursorPayload, expected: ReadCursorBinding): void {
  if (payload.catalogVersion !== expected.catalogVersion || payload.projectionVersion !== expected.projectionVersion) throw new CursorStaleError();
  if (payload.subject !== expected.subject || !sameScope(payload.architectureScope, expected.architectureScope) || payload.locale !== expected.locale || payload.queryDigest !== expected.queryDigest) throw new Error("binding mismatch");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScope(value: unknown): value is ArchitectureScopeRef {
  return isRecord(value) && typeof value.applicationServiceId === "string" && Boolean(value.applicationServiceId) && typeof value.scopePath === "string" && Boolean(value.scopePath);
}

function isLocale(value: unknown): value is ReadLocale {
  return value === "en" || value === "zh";
}

function isOrderKey(value: unknown): value is ReadOrderKey {
  return Array.isArray(value) && value.length > 0 && value.every((part) => (typeof part === "string" && part.length > 0) || (typeof part === "number" && Number.isFinite(part)));
}

function sameScope(left: ArchitectureScopeRef, right: ArchitectureScopeRef): boolean {
  return left.applicationServiceId === right.applicationServiceId && left.scopePath === right.scopePath;
}
