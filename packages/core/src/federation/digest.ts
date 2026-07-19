import { createHash } from "node:crypto";

export function compareCanonical(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function sortValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === undefined) return { $type: "undefined" };
  if (typeof value === "bigint") return { $type: "bigint", value: value.toString() };
  if (typeof value === "symbol") return { $type: "symbol", value: String(value) };
  if (typeof value === "function") return { $type: "function", value: value.name || "anonymous" };
  if (typeof value !== "object" || value === null) return value;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? { $type: "invalid-date" }
      : { $type: "date", value: value.toISOString() };
  }
  if (seen.has(value)) return { $type: "circular" };
  seen.add(value);
  let normalized: unknown;
  if (Array.isArray(value)) {
    normalized = value.map((item) => sortValue(item, seen));
  } else if (value instanceof Map) {
    normalized = {
      $type: "map",
      value: Array.from(value.entries())
        .map(([key, item]) => [sortValue(key, seen), sortValue(item, seen)])
        .sort(([left], [right]) => compareCanonical(JSON.stringify(left), JSON.stringify(right)))
    };
  } else if (value instanceof Set) {
    normalized = {
      $type: "set",
      value: Array.from(value.values()).map((item) => sortValue(item, seen))
        .sort((left, right) => compareCanonical(JSON.stringify(left), JSON.stringify(right)))
    };
  } else {
    normalized = Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => compareCanonical(left, right))
        .map(([key, item]) => [key, sortValue(item, seen)])
    );
  }
  seen.delete(value);
  return normalized;
}

export function normalizeForDigest(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function contentDigest(value: unknown): string {
  return createHash("sha256").update(normalizeForDigest(value)).digest("hex");
}
