import { createHash } from "node:crypto";
import type { ProjectionIdentity, ProjectionScope } from "./projector.js";

export interface ParityTuple {
  entityType: string;
  logicalId: string;
  relationType?: string;
  sourceId?: string;
  targetId?: string;
}

export interface ParitySnapshot {
  scope: ProjectionScope;
  identity: ProjectionIdentity;
  tuples: readonly ParityTuple[];
  semanticProbes?: Readonly<Record<string, string>>;
  sourceWatermarks: Readonly<Record<string, string>>;
  evidenceReferences?: readonly string[];
}

export interface GenerationParityOptions {
  bucketCount?: number;
}

export interface GenerationParityResult {
  status: "MATCH" | "MISMATCH";
  identity: ProjectionIdentity;
  expectedCounts: Readonly<Record<string, number>>;
  actualCounts: Readonly<Record<string, number>>;
  expectedDigest: string;
  actualDigest: string;
  mismatchBuckets: readonly string[];
  semanticProbeMismatches: readonly string[];
  sourceWatermarks: {
    expected: Readonly<Record<string, string>>;
    actual: Readonly<Record<string, string>>;
  };
  evidenceReferences: {
    expected: readonly string[];
    actual: readonly string[];
  };
}

export function compareGenerationParity(
  expected: ParitySnapshot,
  actual: ParitySnapshot,
  options: GenerationParityOptions = {}
): GenerationParityResult {
  const bucketCount = options.bucketCount ?? 64;
  if (!Number.isInteger(bucketCount) || bucketCount < 1 || bucketCount > 1024) {
    throw new Error("PARITY_BUCKET_COUNT_INVALID");
  }

  const expectedTuples = canonicalTuples(expected.tuples);
  const actualTuples = canonicalTuples(actual.tuples);
  const expectedBuckets = bucketDigests(expectedTuples, bucketCount);
  const actualBuckets = bucketDigests(actualTuples, bucketCount);
  const mismatchBuckets = Array.from({ length: bucketCount }, (_, index) => String(index))
    .filter((bucket) => expectedBuckets[Number(bucket)] !== actualBuckets[Number(bucket)]);
  const expectedCounts = counts(expectedTuples);
  const actualCounts = counts(actualTuples);
  const semanticProbeMismatches = probeMismatches(expected.semanticProbes ?? {}, actual.semanticProbes ?? {});
  const scopeMatches = sameScope(expected.scope, actual.scope);
  const identityMatches = sameIdentity(expected.identity, actual.identity);
  const expectedDigest = digest(expectedTuples);
  const actualDigest = digest(actualTuples);
  const status = scopeMatches && identityMatches &&
    JSON.stringify(expectedCounts) === JSON.stringify(actualCounts) &&
    expectedDigest === actualDigest && mismatchBuckets.length === 0 && semanticProbeMismatches.length === 0
    ? "MATCH"
    : "MISMATCH";

  return {
    status,
    identity: actual.identity,
    expectedCounts,
    actualCounts,
    expectedDigest,
    actualDigest,
    mismatchBuckets,
    semanticProbeMismatches: identityMatches && scopeMatches
      ? semanticProbeMismatches
      : ["SCOPE_OR_IDENTITY_MISMATCH", ...semanticProbeMismatches],
    sourceWatermarks: {
      expected: expected.sourceWatermarks,
      actual: actual.sourceWatermarks
    },
    evidenceReferences: {
      expected: expected.evidenceReferences ?? [],
      actual: actual.evidenceReferences ?? []
    }
  };
}

function canonicalTuples(tuples: readonly ParityTuple[]): ParityTuple[] {
  return tuples.map((tuple) => ({
    entityType: required(tuple.entityType),
    logicalId: required(tuple.logicalId),
    relationType: tuple.relationType ?? "",
    sourceId: tuple.sourceId ?? "",
    targetId: tuple.targetId ?? ""
  })).sort((left, right) => tupleKey(left).localeCompare(tupleKey(right)));
}

function bucketDigests(tuples: readonly ParityTuple[], bucketCount: number): string[] {
  const buckets = Array.from({ length: bucketCount }, () => [] as string[]);
  for (const tuple of tuples) {
    const key = tupleKey(tuple);
    const bucket = Number.parseInt(createHash("sha256").update(key).digest("hex").slice(0, 8), 16) % bucketCount;
    buckets[bucket]?.push(key);
  }
  return buckets.map((bucket) => digest(bucket));
}

function counts(tuples: readonly ParityTuple[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const tuple of tuples) {
    result[tuple.entityType] = (result[tuple.entityType] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function probeMismatches(expected: Readonly<Record<string, string>>, actual: Readonly<Record<string, string>>): string[] {
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  return Array.from(keys).sort().filter((key) => expected[key] !== actual[key]);
}

function tupleKey(tuple: ParityTuple): string {
  return JSON.stringify([tuple.entityType, tuple.logicalId, tuple.relationType ?? "", tuple.sourceId ?? "", tuple.targetId ?? ""]);
}

function digest(value: readonly string[] | readonly ParityTuple[]): string {
  const serialized = Array.isArray(value) && (value.length === 0 || typeof value[0] === "string")
    ? (value as readonly string[]).join("\n")
    : (value as readonly ParityTuple[]).map(tupleKey).join("\n");
  return createHash("sha256").update(serialized).digest("hex");
}

function required(value: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error("PARITY_TUPLE_INVALID");
  return value;
}

function sameScope(left: ProjectionScope, right: ProjectionScope): boolean {
  return left.enterpriseId === right.enterpriseId && left.applicationServiceId === right.applicationServiceId && left.scopePath === right.scopePath;
}

function sameIdentity(left: ProjectionIdentity, right: ProjectionIdentity): boolean {
  return left.baselineId === right.baselineId && left.manifestId === right.manifestId && left.generationId === right.generationId && left.schemaVersion === right.schemaVersion;
}
