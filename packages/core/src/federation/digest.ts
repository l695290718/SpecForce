import { createHash } from "node:crypto";

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortValue(item)])
    );
  }
  return value;
}

export function normalizeForDigest(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function contentDigest(value: unknown): string {
  return createHash("sha256").update(normalizeForDigest(value)).digest("hex");
}
