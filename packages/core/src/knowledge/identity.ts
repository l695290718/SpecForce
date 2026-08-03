import type { ScannerObservationType } from "../scanner/types";

export type IdentityMatchDecision = "UNMATCHED" | "UNAMBIGUOUS" | "AMBIGUOUS";

export interface IdentityMatchObservation {
  id: string;
  observationType: ScannerObservationType;
  sourcePath: string;
  semanticIdentity?: string;
}

export interface IdentityMatchTarget {
  type: string;
  id: string;
  name: string;
  code?: string;
  payload?: Record<string, unknown>;
}

export interface IdentityMatch {
  targetAssetType: string;
  targetAssetId: string;
  confidence: number;
  matchingEvidence: string[];
  counterEvidence: string[];
}

export interface IdentityMatchResult {
  decision: IdentityMatchDecision;
  matches: IdentityMatch[];
  targetAssetTypes: string[];
  unresolvedQuestions: string[];
}

const targetTypesByObservation: Record<ScannerObservationType, string[]> = {
  "api-contract": ["api"],
  "event-contract": ["event"],
  "data-model": ["dataModel"],
  "system-component": ["integration", "domain", "stateMachine"],
  "documentation": ["adr", "evidence"],
  "source-file": ["domain", "dataModel", "api", "event", "businessRule", "stateMachine", "integration", "quality", "observability", "adr"]
};

const ignoredTokens = new Set(["src", "source", "contracts", "contract", "openapi", "asyncapi", "schema", "json", "yaml", "yml", "ts", "tsx", "js", "jsx", "java", "kt", "py", "go", "rs", "cs", "api", "event", "model", "service"]);

export function matchIdentity(input: { observation: IdentityMatchObservation; targets: IdentityMatchTarget[] }): IdentityMatchResult {
  const targetAssetTypes = targetTypesByObservation[input.observation.observationType] ?? [];
  const sourceTokens = new Set(meaningfulTokens(`${input.observation.sourcePath} ${input.observation.semanticIdentity ?? ""}`));
  const matches = input.targets
    .filter((target) => targetAssetTypes.includes(target.type))
    .map((target) => scoreTarget(sourceTokens, input.observation.sourcePath, target))
    .filter((match): match is IdentityMatch => match !== undefined)
    .sort((left, right) => right.confidence - left.confidence || left.targetAssetType.localeCompare(right.targetAssetType) || left.targetAssetId.localeCompare(right.targetAssetId));

  return {
    decision: matches.length === 0 ? "UNMATCHED" : matches.length === 1 ? "UNAMBIGUOUS" : "AMBIGUOUS",
    matches,
    targetAssetTypes,
    unresolvedQuestions: matches.length === 0
      ? ["No existing design asset matched this source observation.", "Confirm whether the source represents a new asset or belongs to another authorized Scope."]
      : matches.length > 1
        ? ["Multiple existing design assets matched this source observation.", "Confirm the intended target before accepting an identity mapping."]
        : ["Confirm that the deterministic match represents the same semantic concept."]
  };
}

function scoreTarget(sourceTokens: Set<string>, sourcePath: string, target: IdentityMatchTarget): IdentityMatch | undefined {
  const aliases = [target.id, target.name, target.code ?? ""];
  const aliasTokens = new Set(meaningfulTokens(aliases.join(" ")));
  const overlap = [...sourceTokens].filter((token) => aliasTokens.has(token));
  if (overlap.length === 0) return undefined;

  const normalizedPath = normalizeIdentityText(sourcePath);
  const normalizedAliases = aliases.map(normalizeIdentityText).filter(Boolean);
  const exactAlias = normalizedAliases.find((alias) => alias.length >= 3 && normalizedPath.includes(alias));
  const confidence = exactAlias ? 0.92 : Math.min(0.86, 0.68 + overlap.length * 0.06);
  return {
    targetAssetType: target.type,
    targetAssetId: target.id,
    confidence,
    matchingEvidence: [
      `source-path:${sourcePath}`,
      `matched-tokens:${overlap.sort().join(",")}`,
      ...(exactAlias ? [`matched-alias:${exactAlias}`] : [])
    ],
    counterEvidence: []
  };
}

function meaningfulTokens(value: string): string[] {
  return [...new Set(normalizeIdentityText(value).split(" ").filter((token) => token.length >= 3 && !ignoredTokens.has(token)))];
}

function normalizeIdentityText(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim();
}
