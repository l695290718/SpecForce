import { createHash } from "node:crypto";

function sortValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === undefined) return { $type: "undefined" };
  if (typeof value === "bigint") return { $type: "bigint", value: value.toString() };
  if (typeof value === "symbol") return { $type: "symbol", value: String(value) };
  if (typeof value === "function") return { $type: "function", value: value.name || "anonymous" };
  if (typeof value !== "object" || value === null) return value;
  if (value instanceof Date) return { $type: "date", value: value.toISOString() };
  if (seen.has(value)) return { $type: "circular" };
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sortValue(item, seen));
  if (value instanceof Map) {
    return {
      $type: "map",
      value: Array.from(value.entries())
        .map(([key, item]) => [sortValue(key, seen), sortValue(item, seen)])
        .sort(([left], [right]) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
    };
  }
  if (value instanceof Set) {
    return {
      $type: "set",
      value: Array.from(value.values()).map((item) => sortValue(item, seen))
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
    };
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortValue(item, seen)])
    );
  }
  return { $type: "unsupported", value: String(value) };
}

export function normalizeForDigest(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function contentDigest(value: unknown): string {
  return createHash("sha256").update(normalizeForDigest(value)).digest("hex");
}
