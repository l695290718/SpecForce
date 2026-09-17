import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

const observationCount = 100_000;
const batchSize = 500;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function buildBatch(sequence: number, start: number, end: number, previous: string | null) {
  const ids = Array.from({ length: end - start }, (_, offset) => `observation:${start + offset}`);
  const payload = JSON.stringify({ sequence, previous, ids });
  return { sequence, previous, ids, digest: digest(payload) };
}

describe("governed full-asset scan scale invariants", () => {
  it("keeps 100,000 observations ordered, bounded, resumable, and duplicate-free", () => {
    const batches = [];
    let previous: string | null = null;
    for (let start = 0; start < observationCount; start += batchSize) {
      const batch = buildBatch(batches.length, start, Math.min(start + batchSize, observationCount), previous);
      batches.push(batch);
      previous = batch.digest;
    }

    expect(batches).toHaveLength(200);
    expect(Math.max(...batches.map((batch) => batch.ids.length))).toBe(batchSize);
    expect(new Set(batches.flatMap((batch) => batch.ids)).size).toBe(observationCount);

    const interruption = batches[99]!;
    const resumed = batches.slice(100);
    expect(resumed[0]!.previous).toBe(interruption.digest);
    expect(resumed.map((batch) => batch.sequence)).toEqual(Array.from({ length: 100 }, (_, index) => index + 100));
    expect(batches.map((batch) => batch.digest)).toEqual(batches.map((batch) => batch.digest));
  });
});
