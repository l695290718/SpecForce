// Deterministic relation-code colors shared by edge rendering, the legend, and the minimap.
// The palette favors hues that stay readable on the dark graph canvas at low opacity.

const RELATION_PALETTE: ReadonlyArray<string> = [
  "125,211,252", // sky-300
  "253,224,71", // amber-300
  "134,239,172", // emerald-300
  "249,168,212", // pink-300
  "196,181,253", // violet-300
  "251,146,60", // orange-400
  "45,212,191", // teal-400
  "248,113,113", // red-400
  "165,180,252", // indigo-300
  "217,249,157" // lime-300
];

export const BRIDGE_RELATION_RGB = "148,163,184";

export function relationRgb(code: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < code.length; index += 1) {
    hash ^= code.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return RELATION_PALETTE[(hash >>> 0) % RELATION_PALETTE.length] ?? BRIDGE_RELATION_RGB;
}

export function relationColor(code: string, opacity: number): string {
  return `rgba(${relationRgb(code)},${Math.max(0.08, Math.min(1, opacity))})`;
}

export interface RelationSummary {
  code: string;
  count: number;
  rgb: string;
}

export function summarizeRelations(codes: Iterable<string>, max = 8): RelationSummary[] {
  const counts = new Map<string, number>();
  for (const code of codes) counts.set(code, (counts.get(code) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([code, count]) => ({ code, count, rgb: relationRgb(code) }));
}

export function toggleRelationCode(codes: ReadonlySet<string>, code: string): ReadonlySet<string> {
  const next = new Set(codes);
  if (next.has(code)) next.delete(code);
  else next.add(code);
  return next;
}
