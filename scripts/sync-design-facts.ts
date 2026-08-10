import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface DesignFactManifestDecision {
  id: string;
  repositoryAdr: string;
  mcpAdrId: string;
  scope: { applicationServiceId: string; scopePath: string };
  proposalId: string;
  contextPackId: string;
  relatedAssetIds: string[];
  managedAssets?: ManagedDesignAsset[];
  managedRelationships?: ManagedDesignRelationship[];
  evidence: Array<{ command: string; result: string }>;
  proposalStatus?: "draft" | "reviewing" | "approved" | "implemented" | "archived";
  status?: string;
  owner?: string;
  reason?: string;
  retryTrigger?: string;
  auditFailureCode?: string;
  auditDiagnosticReference?: string;
  auditSecurityContract?: string;
  localizedContent?: {
    en: Record<string, string | string[]>;
    zh: Record<string, string | string[]>;
  };
}

export interface DesignFactManifest {
  decisions: DesignFactManifestDecision[];
}

export interface AdrSource {
  title: string;
  english: string;
  chinese: string;
}

export interface DesignFactSyncReceipt {
  id: string;
  mcpAdrId: string;
  status: "complete";
}

export function designEvidenceId(decisionId: string, index: number): string {
  return `evidence-${decisionId}-${index + 1}`;
}

type CallTool = (name: string, input: Record<string, unknown>) => Promise<{ ok?: boolean; isError?: boolean; message?: string }>;
type ExistingRecordType = "proposal" | "contextPack";

interface AdrFields {
  title: string;
  description: string;
  context: string;
  decision: string;
  alternatives: string[];
  consequences: string[];
  constraints: string[];
  evidence: string[];
}

interface ParsedAdr {
  en: AdrFields;
  zh: AdrFields;
}

const supportedManifestLocalizedFields = new Set([
  "name",
  "title",
  "description",
  "context",
  "decision",
  "alternatives",
  "consequences",
  "constraints"
]);

const canonicalStringFields = new Set(["name", "title", "description", "context", "decision"]);
const canonicalArrayFields = new Set(["alternatives", "consequences", "constraints"]);
const proposalLocalizedStringFields = ["name", "title", "description", "background", "goal", "nonGoal", "scope", "rolloutPlan"] as const;
const proposalLocalizedOptionalStringFields = ["rollbackPlan"] as const;
const proposalLocalizedArrayFields = ["specChanges", "risks"] as const;
const contextPackLocalizedStringFields = ["name", "summary", "generatedMarkdown"] as const;
const contextPackLocalizedArrayFields = ["constraints", "instructions"] as const;

export async function synchronizeDesignFacts(input: {
  callTool: CallTool;
  manifest: DesignFactManifest;
  readAdr: (path: string) => Promise<AdrSource>;
  readExisting?: (type: ExistingRecordType, id: string, scope: DesignFactManifestDecision["scope"]) => Promise<Record<string, unknown> | undefined>;
}): Promise<DesignFactSyncReceipt[]> {
  const receipts: DesignFactSyncReceipt[] = [];

  for (const decision of input.manifest.decisions) {
    assertDecision(decision);
    const source = await input.readAdr(decision.repositoryAdr);
    if (!source.english.trim() || !source.chinese.trim()) throw new Error(`DESIGN_FACT_LOCALIZATION_MISSING: ${decision.id}`);
    const parsed = parseAdrSource(source);

    for (const managed of decision.managedAssets ?? []) {
      await callOrThrow(input.callTool, "upsert_design_asset", {
        assetType: managed.assetType,
        asset: { ...managed.asset, architectureScope: decision.scope },
        architectureScope: decision.scope
      }, decision.id);
    }

    const result = await input.callTool("create_adr", {
      applicationServiceId: decision.scope.applicationServiceId,
      architectureScope: decision.scope,
      adr: buildAdr(decision, parsed)
    });
    if (result.isError || result.ok === false) {
      throw new Error(`DESIGN_FACT_MCP_WRITE_FAILED: ${decision.id}${result.message ? `: ${result.message}` : ""}`);
    }

    if (input.readExisting) {
      const proposal = await input.readExisting("proposal", decision.proposalId, decision.scope);
      const contextPack = await input.readExisting("contextPack", decision.contextPackId, decision.scope);
      const syncedProposal = backfillProposal(decision, proposal, buildProposal(decision, parsed));
      const syncedContextPack = backfillContextPack(decision, contextPack, buildContextPack(decision, parsed));
      await callOrThrow(input.callTool, "upsert_proposal", { proposal: syncedProposal, architectureScope: decision.scope }, decision.id);
      await callOrThrow(input.callTool, "upsert_context_pack", { contextPack: syncedContextPack, architectureScope: decision.scope }, decision.id);
      await callOrThrow(input.callTool, "link_assets", link("proposal", decision.proposalId, "adr", decision.mcpAdrId, "IMPLEMENTS_DECISION", decision.scope), decision.id);
      await callOrThrow(input.callTool, "link_assets", link("contextPack", decision.contextPackId, "proposal", decision.proposalId, "IMPLEMENTS_CONTEXT_FOR", decision.scope), decision.id);
      for (const assetId of decision.relatedAssetIds) {
        await callOrThrow(input.callTool, "link_assets", link("adr", decision.mcpAdrId, assetTypeFor(assetId), assetId, "DECIDES", decision.scope), decision.id);
      }
      for (const relationship of decision.managedRelationships ?? []) {
        await callOrThrow(input.callTool, "link_assets", { ...relationship, architectureScope: decision.scope }, decision.id);
      }
    }

    for (const [index, evidence] of decision.evidence.entries()) {
      const evidenceId = designEvidenceId(decision.id, index);
      await callOrThrow(input.callTool, "upsert_design_asset", {
        assetType: "evidence",
        asset: buildEvidence(decision, parsed, evidenceId, evidence),
        architectureScope: decision.scope
      }, decision.id);
      await callOrThrow(input.callTool, "link_assets", link("evidence", evidenceId, "adr", decision.mcpAdrId, "VALIDATES", decision.scope), decision.id);
    }

    receipts.push({ id: decision.id, mcpAdrId: decision.mcpAdrId, status: "complete" });
  }

  return receipts;
}

function buildProposal(decision: DesignFactManifestDecision, parsed: ParsedAdr) {
  const now = new Date().toISOString();
  return {
    id: decision.proposalId,
    name: parsed.en.title,
    title: parsed.en.title,
    description: parsed.en.description,
    background: parsed.en.context,
    goal: parsed.en.decision,
    nonGoal: "Deferred connector delivery and external APPLY remain outside this increment.",
    scope: parsed.en.constraints.join(" "),
    impactedAssets: decision.relatedAssetIds.map((id) => assetRefFor(id)),
    specChanges: [parsed.en.decision],
    risks: parsed.en.consequences,
    rolloutPlan: parsed.en.evidence.join(" "),
    status: decision.proposalStatus ?? "implemented",
    createdAt: now,
    updatedAt: now,
    localizedContent: {
      en: {
        name: parsed.en.title,
        title: parsed.en.title,
        description: parsed.en.description,
        background: parsed.en.context,
        goal: parsed.en.decision,
        nonGoal: "Deferred connector delivery and external APPLY remain outside this increment.",
        scope: parsed.en.constraints.join(" "),
        specChanges: [parsed.en.decision],
        risks: parsed.en.consequences,
        rolloutPlan: parsed.en.evidence.join(" ")
      },
      zh: {
        name: parsed.zh.title,
        title: parsed.zh.title,
        description: parsed.zh.description,
        background: parsed.zh.context,
        goal: parsed.zh.decision,
        nonGoal: "连接器交付和外部 APPLY 在本增量之外延期。",
        scope: parsed.zh.constraints.join(" "),
        specChanges: [parsed.zh.decision],
        risks: parsed.zh.consequences,
        rolloutPlan: parsed.zh.evidence.join(" ")
      }
    }
  };
}

export interface ManagedDesignAsset {
  assetType: "api" | "dataModel" | "businessRule" | "quality" | "observability";
  asset: Record<string, unknown> & { id: string };
}

export interface ManagedDesignRelationship {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relationType: string;
}

function backfillProposal(
  decision: DesignFactManifestDecision,
  existing: Record<string, unknown> | undefined,
  canonical: ReturnType<typeof buildProposal>
) {
  if (!existing) return canonical;
  const proposal = {
    ...canonical,
    ...existing,
    id: canonical.id,
    status: canonical.status,
    architectureScope: decision.scope,
    localizedContent: {
      en: completeLocalizedFields({
        current: localeRecord(existing, "en"),
        topLevel: existing,
        fallback: canonical.localizedContent.en,
        requiredStringFields: proposalLocalizedStringFields,
        optionalStringFields: proposalLocalizedOptionalStringFields,
        requiredArrayFields: proposalLocalizedArrayFields
      }),
      zh: completeLocalizedFields({
        current: localeRecord(existing, "zh"),
        fallback: canonical.localizedContent.zh,
        requiredStringFields: proposalLocalizedStringFields,
        optionalStringFields: proposalLocalizedOptionalStringFields,
        requiredArrayFields: proposalLocalizedArrayFields
      })
    }
  };
  return proposal;
}

function buildContextPack(decision: DesignFactManifestDecision, parsed: ParsedAdr) {
  const now = new Date().toISOString();
  const generatedMarkdown = renderContextMarkdown(parsed.en);
  const generatedChineseMarkdown = renderContextMarkdown(parsed.zh);
  return {
    id: decision.contextPackId,
    name: `${parsed.en.title} Context Pack`,
    proposalId: decision.proposalId,
    targetAgent: "generic",
    summary: parsed.en.description,
    includedAssets: decision.relatedAssetIds.map((id) => assetRefFor(id)),
    constraints: parsed.en.constraints,
    instructions: [parsed.en.decision],
    generatedMarkdown,
    createdAt: now,
    architectureScope: decision.scope,
    localizedContent: {
      en: { name: `${parsed.en.title} Context Pack`, summary: parsed.en.description, constraints: parsed.en.constraints, instructions: [parsed.en.decision], generatedMarkdown },
      zh: { name: `${parsed.zh.title} 上下文包`, summary: parsed.zh.description, constraints: parsed.zh.constraints, instructions: [parsed.zh.decision], generatedMarkdown: generatedChineseMarkdown }
    }
  };
}

function backfillContextPack(
  decision: DesignFactManifestDecision,
  existing: Record<string, unknown> | undefined,
  canonical: ReturnType<typeof buildContextPack>
) {
  if (!existing) return canonical;
  const contextPack = {
    ...canonical,
    ...existing,
    id: canonical.id,
    proposalId: canonical.proposalId,
    architectureScope: decision.scope,
    localizedContent: {
      en: completeLocalizedFields({
        current: localeRecord(existing, "en"),
        topLevel: existing,
        fallback: canonical.localizedContent.en,
        requiredStringFields: contextPackLocalizedStringFields,
        requiredArrayFields: contextPackLocalizedArrayFields
      }),
      zh: completeLocalizedFields({
        current: localeRecord(existing, "zh"),
        fallback: canonical.localizedContent.zh,
        requiredStringFields: contextPackLocalizedStringFields,
        requiredArrayFields: contextPackLocalizedArrayFields
      })
    }
  };
  return contextPack;
}

function buildEvidence(
  decision: DesignFactManifestDecision,
  parsed: ParsedAdr,
  id: string,
  evidence: DesignFactManifestDecision["evidence"][number]
) {
  const now = new Date().toISOString();
  const name = `${parsed.en.title} verification evidence`;
  const description = `Verification evidence for ${parsed.en.title}.`;
  return {
    id,
    name,
    description,
    decisionId: decision.mcpAdrId,
    command: evidence.command,
    result: evidence.result,
    status: "passed" as const,
    recordedAt: now,
    createdAt: now,
    updatedAt: now,
    localizedContent: {
      en: { name, description, command: evidence.command, result: evidence.result },
      zh: {
        name: `${parsed.zh.title} 验证证据`,
        description: `用于验证 ${parsed.zh.title} 的证据。`,
        command: evidence.command,
        result: evidence.result
      }
    }
  };
}

async function callOrThrow(callTool: CallTool, name: string, input: Record<string, unknown>, decisionId: string): Promise<void> {
  const result = await callTool(name, input);
  if (result.isError || result.ok === false) throw new Error(`DESIGN_FACT_MCP_WRITE_FAILED: ${decisionId}${result.message ? `: ${result.message}` : ""}`);
}

function link(sourceType: string, sourceId: string, targetType: string, targetId: string, relationType: string, architectureScope: DesignFactManifestDecision["scope"]) {
  return { sourceType, sourceId, targetType, targetId, relationType, architectureScope };
}

function assetTypeFor(id: string): string {
  if (id.startsWith("api-")) return "api";
  if (id.startsWith("data-")) return "dataModel";
  if (id.startsWith("rule-")) return "businessRule";
  if (id.startsWith("quality-")) return "quality";
  if (id.startsWith("observability-") || id.startsWith("obs-")) return "observability";
  if (id.startsWith("adr-")) return "adr";
  if (id.startsWith("proposal-")) return "proposal";
  if (id.startsWith("context-pack-") || id.startsWith("ctx-")) return "contextPack";
  if (id.startsWith("evidence-")) return "evidence";
  throw new Error(`DESIGN_FACT_RELATED_ASSET_PREFIX_UNKNOWN: ${id}`);
}

function assetRefFor(id: string) {
  return { type: assetTypeFor(id), id, label: id };
}

function assertDecision(decision: DesignFactManifestDecision): void {
  if (!decision.scope?.applicationServiceId || !decision.scope.scopePath) {
    throw new Error(`DESIGN_FACT_SCOPE_MISSING: ${decision.id}`);
  }
  if (decision.proposalStatus && !["draft", "reviewing", "approved", "implemented", "archived"].includes(decision.proposalStatus)) {
    throw new Error(`DESIGN_FACT_PROPOSAL_STATUS_INVALID: ${decision.id}`);
  }
  for (const relatedAssetId of decision.relatedAssetIds) assetTypeFor(relatedAssetId);
  const managedIds = new Set<string>();
  for (const managed of decision.managedAssets ?? []) {
    if (assetTypeFor(managed.asset.id) !== managed.assetType) {
      throw new Error(`DESIGN_FACT_MANAGED_ASSET_TYPE_MISMATCH: ${managed.asset.id}`);
    }
    if (managedIds.has(managed.asset.id)) throw new Error(`DESIGN_FACT_MANAGED_ASSET_DUPLICATE: ${managed.asset.id}`);
    managedIds.add(managed.asset.id);
    assertManagedAssetLocalization(decision.id, managed);
  }
  for (const relationship of decision.managedRelationships ?? []) {
    assetTypeFor(relationship.sourceId);
    assetTypeFor(relationship.targetId);
    if (!relationship.relationType.trim()) throw new Error(`DESIGN_FACT_RELATIONSHIP_TYPE_MISSING: ${decision.id}`);
  }
}

function assertManagedAssetLocalization(decisionId: string, managed: ManagedDesignAsset): void {
  const localized = managed.asset.localizedContent;
  if (!localized || typeof localized !== "object" || Array.isArray(localized)) {
    throw new Error(`DESIGN_FACT_MANAGED_ASSET_LOCALIZATION_MISSING: ${decisionId}:${managed.asset.id}`);
  }
  const locales = localized as Record<string, unknown>;
  for (const locale of ["en", "zh"] as const) {
    const value = locales[locale];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`DESIGN_FACT_MANAGED_ASSET_LOCALIZATION_MISSING: ${decisionId}:${managed.asset.id}:${locale}`);
    }
    const record = value as Record<string, unknown>;
    if (typeof record.name !== "string" || !record.name.trim() || typeof record.description !== "string" || !record.description.trim()) {
      throw new Error(`DESIGN_FACT_MANAGED_ASSET_LOCALIZATION_INCOMPLETE: ${decisionId}:${managed.asset.id}:${locale}`);
    }
  }
}

function buildAdr(decision: DesignFactManifestDecision, parsed: ParsedAdr) {
  const now = new Date().toISOString();
  const localizedContent = mergeAdrLocalizedContent(decision, parsed);
  const english = localizedContent.en;
  return {
    id: decision.mcpAdrId,
    name: english.name,
    title: english.title,
    description: english.description,
    status: "accepted",
    context: english.context,
    decision: english.decision,
    alternatives: english.alternatives,
    consequences: english.consequences,
    constraints: english.constraints,
    evidence: parsed.en.evidence,
    relatedAssets: decision.relatedAssetIds.map((id) => assetRefFor(id)),
    owner: decision.owner ?? "SpecForge Architecture",
    createdAt: now,
    updatedAt: now,
    localizedContent
  };
}

function mergeAdrLocalizedContent(decision: DesignFactManifestDecision, parsed: ParsedAdr) {
  const canonical = {
    en: {
      name: parsed.en.title,
      description: parsed.en.description,
      title: parsed.en.title,
      context: parsed.en.context,
      decision: parsed.en.decision,
      alternatives: parsed.en.alternatives,
      consequences: parsed.en.consequences,
      constraints: parsed.en.constraints
    },
    zh: {
      name: parsed.zh.title,
      description: parsed.zh.description,
      title: parsed.zh.title,
      context: parsed.zh.context,
      decision: parsed.zh.decision,
      alternatives: parsed.zh.alternatives,
      consequences: parsed.zh.consequences,
      constraints: parsed.zh.constraints
    }
  };
  return {
    en: { ...canonical.en, ...supportedManifestOverlay(decision.id, "en", decision.localizedContent?.en, canonical.en) },
    zh: { ...canonical.zh, ...supportedManifestOverlay(decision.id, "zh", decision.localizedContent?.zh, canonical.zh) }
  };
}

function supportedManifestOverlay(
  decisionId: string,
  locale: "en" | "zh",
  value: Record<string, string | string[]> | undefined,
  canonical: Record<string, string | string[]>
): Record<string, string | string[]> {
  if (!value) return {};
  const overlay: Record<string, string | string[]> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!supportedManifestLocalizedFields.has(key)) {
      throw new Error(`DESIGN_FACT_LOCALIZATION_KEY_UNSUPPORTED: ${decisionId}:${locale}.${key}`);
    }
    if (canonicalStringFields.has(key) && typeof candidate !== "string") {
      throw new Error(`DESIGN_FACT_LOCALIZATION_VALUE_INVALID: ${decisionId}:${locale}.${key}`);
    }
    if (canonicalArrayFields.has(key) && (!Array.isArray(candidate) || candidate.some((item) => typeof item !== "string"))) {
      throw new Error(`DESIGN_FACT_LOCALIZATION_VALUE_INVALID: ${decisionId}:${locale}.${key}`);
    }
    if ((key === "name" || key === "title" || key === "description" || key === "context") && candidate !== canonical[key]) {
      throw new Error(`DESIGN_FACT_LOCALIZATION_CANONICAL_OVERRIDE: ${decisionId}:${locale}.${key}`);
    }
    overlay[key] = candidate;
  }
  return overlay;
}

function parseAdrSource(source: AdrSource): ParsedAdr {
  return {
    en: parseAdrFields(source.english, source.title, {
      context: ["context"],
      decision: ["decision"],
      alternatives: ["alternatives"],
      consequences: ["consequences"],
      constraints: ["constraints"],
      evidence: ["evidence"]
    }, false),
    zh: parseAdrFields(source.chinese, source.title, {
      context: ["背景"],
      decision: ["决策"],
      alternatives: ["备选方案"],
      consequences: ["后果"],
      constraints: ["约束"],
      evidence: ["证据"]
    }, true)
  };
}

function parseAdrFields(markdown: string, fallbackTitle: string, headings: Record<Exclude<keyof AdrFields, "title" | "description">, string[]>, localized: boolean): AdrFields {
  const sections = localized
    ? [...extractMarkdownSections(markdown, 3), ...extractBoldLocalizedSections(markdown)]
    : extractMarkdownSections(markdown, 2);
  const context = sectionValue(sections, headings.context, markdown, "context");
  const decision = sectionValue(sections, headings.decision, markdown, "decision");
  const alternatives = listValue(sectionValue(sections, headings.alternatives, markdown, "alternatives"));
  const consequences = listValue(sectionValue(sections, headings.consequences, markdown, "consequences"));
  const constraints = listValue(sectionValue(sections, headings.constraints, markdown, "constraints"));
  const evidence = listValue(sectionValue(sections, headings.evidence, markdown, "evidence"));
  const title = localized
    ? sections.find(([heading]) => ["标题", "title"].includes(heading.toLowerCase()))?.[1].trim() || localizedTitle(markdown)
    : fallbackTitle;
  return { title, description: firstParagraph(context), context, decision, alternatives, consequences, constraints, evidence };
}

function extractMarkdownSections(markdown: string, level: 2 | 3): Array<[string, string]> {
  const headingPattern = new RegExp(`^#{${level}}\\s+(.+?)\\s*$`, "gm");
  const headings = [...markdown.matchAll(headingPattern)];
  return headings.map((heading, index) => [heading[1].trim(), markdown.slice(heading.index! + heading[0].length, headings[index + 1]?.index ?? markdown.length).trim()] as [string, string]);
}

function extractBoldLocalizedSections(markdown: string): Array<[string, string]> {
  const headingPattern = /^\*\*(.+?)[：:]\*\*\s*$/gm;
  const headings = [...markdown.matchAll(headingPattern)];
  return headings.map((heading, index) => [heading[1].trim(), markdown.slice(heading.index! + heading[0].length, headings[index + 1]?.index ?? markdown.length).trim()] as [string, string]);
}

function sectionValue(sections: Array<[string, string]>, aliases: string[], fallback: string, field: string): string {
  const readableChineseAliases: Record<string, string[]> = {
    context: ["背景"],
    decision: ["决策"],
    alternatives: ["备选方案"],
    consequences: ["后果"],
    constraints: ["约束"],
    evidence: ["证据"]
  };
  const acceptedAliases = [...aliases, ...(readableChineseAliases[field] ?? [])].map((alias) => alias.toLowerCase());
  const match = sections.find(([heading]) => acceptedAliases.includes(heading.trim().toLowerCase()));
  if (match?.[1].trim()) return match[1].trim();
  const fallbackText = localizedFallback(fallback);
  if (fallbackText) return fallbackText;
  throw new Error(`DESIGN_FACT_SECTION_MISSING: ${field}`);
}

function listValue(value: string): string[] {
  const entries: string[] = [];
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const listItem = trimmed.match(/^(?:[-*+]\s+|\d+[.)]\s+)(.+)$/);
    if (listItem) entries.push(listItem[1].trim());
    else if (entries.length) entries[entries.length - 1] = `${entries[entries.length - 1]} ${trimmed}`;
    else entries.push(trimmed);
  }
  return entries.length ? entries : [value.trim()];
}

function firstParagraph(value: string): string {
  return value.split(/\r?\n\s*\r?\n/)[0].replace(/^[-*+]\s+/, "").trim();
}

function completeLocalizedFields(input: {
  current: Record<string, unknown> | undefined;
  fallback: Record<string, string | string[]>;
  topLevel?: Record<string, unknown>;
  requiredStringFields: readonly string[];
  optionalStringFields?: readonly string[];
  requiredArrayFields?: readonly string[];
}): Record<string, string | string[]> {
  const localized: Record<string, string | string[]> = {};
  for (const field of input.requiredStringFields) {
    localized[field] = firstNonEmptyString(input.current?.[field], input.topLevel?.[field], input.fallback[field]);
  }
  for (const field of input.optionalStringFields ?? []) {
    const value = firstNonEmptyStringOrUndefined(input.current?.[field], input.topLevel?.[field], input.fallback[field]);
    if (value !== undefined) localized[field] = value;
  }
  for (const field of input.requiredArrayFields ?? []) {
    localized[field] = firstNonEmptyStringArray(input.current?.[field], input.topLevel?.[field], input.fallback[field]);
  }
  return localized;
}

function localeRecord(existing: Record<string, unknown>, locale: "en" | "zh"): Record<string, unknown> | undefined {
  const localizedContent = existing.localizedContent;
  if (!localizedContent || typeof localizedContent !== "object" || Array.isArray(localizedContent)) return undefined;
  const record = (localizedContent as Record<string, unknown>)[locale];
  return record && typeof record === "object" && !Array.isArray(record)
    ? record as Record<string, unknown>
    : undefined;
}

function firstNonEmptyString(...values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function firstNonEmptyStringOrUndefined(...values: Array<unknown>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function firstNonEmptyStringArray(...values: Array<unknown>): string[] {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "string" && entry.trim())) {
      return [...value];
    }
  }
  return [];
}

function localizedFallback(markdown: string): string {
  return markdown.split(/\r?\n/).map((line) => line.trim()).find((line) => line && /[\u4e00-\u9fff]/u.test(line) && !line.startsWith("#")) ?? "";
}

function renderContextMarkdown(fields: AdrFields): string {
  return [
    `# ${fields.title}`,
    "",
    "## Context",
    fields.context,
    "",
    "## Decision",
    fields.decision,
    "",
    "## Constraints",
    fields.constraints.map((item) => `- ${item}`).join("\n")
  ].join("\n");
}

async function readRepositoryAdr(path: string): Promise<AdrSource> {
  return splitAdrSource(await readFile(path, "utf8"));
}

export function splitAdrSource(content: string): AdrSource {
  const boldLocalizationMarkers = [...content.matchAll(/^(?:\*\*中文本地化覆盖[：:]\*\*|中文本地化[^\r\n]*[：:])\s*$/gm)];
  if (boldLocalizationMarkers.length) {
    const englishParts: string[] = [];
    const chineseParts: string[] = [];
    let cursor = 0;

    for (const marker of boldLocalizationMarkers) {
      const markerStart = marker.index!;
      const markerEnd = markerStart + marker[0].length;
      englishParts.push(content.slice(cursor, markerStart));
      const nextEnglishHeading = nextEnglishHeadingIndex(content, markerEnd);
      const localizedSection = content.slice(markerEnd, nextEnglishHeading < 0 ? content.length : nextEnglishHeading).trim();
      chineseParts.push(`### ${localizedHeadingFor(precedingEnglishHeading(content, markerStart))}\n\n${localizedSection}`);
      cursor = nextEnglishHeading < 0 ? content.length : nextEnglishHeading;
    }

    englishParts.push(content.slice(cursor));
    return adrSource(englishParts.join(""), chineseParts.join("\n\n"));
  }

  const chineseHeading = content.search(/^##\s+[^\x00-\x7F]/m);
  const [english, headedChinese = ""] = chineseHeading >= 0
    ? [content.slice(0, chineseHeading), content.slice(chineseHeading)]
    : content.split(/## .*Chinese Localization/);
  return adrSource(english, headedChinese || content.match(/[\u4e00-\u9fff][\s\S]*/)?.[0] || "");
}

function nextEnglishHeadingIndex(content: string, start: number): number {
  const heading = /^#{1,2}\s+[A-Za-z]/gm;
  heading.lastIndex = start;
  const match = heading.exec(content);
  return match?.index ?? -1;
}

function precedingEnglishHeading(content: string, end: number): string {
  const headings = [...content.slice(0, end).matchAll(/^##\s+([A-Za-z][^\r\n]*)$/gm)];
  return headings.at(-1)?.[1].trim() ?? "Localized content";
}

function localizedHeadingFor(heading: string): string {
  return ({
    Context: "背景",
    Decision: "决策",
    Alternatives: "备选方案",
    Consequences: "后果",
    Constraints: "约束",
    Evidence: "证据"
  } as Record<string, string>)[heading] ?? heading;
}

function adrSource(english: string, chinese: string): AdrSource {
  const title = english.match(/^#\s+(?:ADR[- ]?\d+:?\s*)?(.+)$/m)?.[1]?.trim() ?? "Architecture decision";
  return { title, english: english.trim(), chinese: chinese.trim() };
}

function localizedTitle(content: string): string {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && /[\u4e00-\u9fff]/u.test(line))
    ?.slice(0, 80) ?? "Localized architecture decision";
}

async function main(): Promise<void> {
  const fullManifest = JSON.parse(await readFile("docs/design-facts/baseline-manifest.json", "utf8")) as DesignFactManifest;
  const requestedIds = (process.env.SPECFORGE_DESIGN_FACT_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  const manifest: DesignFactManifest = requestedIds.length === 0
    ? fullManifest
    : { ...fullManifest, decisions: fullManifest.decisions.filter((decision) => requestedIds.includes(decision.id) || requestedIds.includes(decision.mcpAdrId)) };
  if (requestedIds.length > 0 && manifest.decisions.length === 0) throw new Error(`DESIGN_FACT_SELECTION_EMPTY: ${requestedIds.join(",")}`);
  // The SDK is owned by the MCP workspace, not duplicated at the repository root.
  const requireFromMcpWorkspace = createRequire(resolve(process.cwd(), "apps/mcp-server/package.json"));
  const { Client } = requireFromMcpWorkspace("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = requireFromMcpWorkspace("@modelcontextprotocol/sdk/client/stdio.js");
  const mcpServerEntry = resolve(process.cwd(), "apps/mcp-server/src/index.ts");
  const tsxCli = resolve(process.cwd(), "apps/mcp-server/node_modules/tsx/dist/cli.mjs");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [tsxCli, mcpServerEntry],
    cwd: process.cwd(),
    env: {
      ...process.env,
      CI: process.env.CI ?? "true",
      SPECFORGE_MCP_SEED: "1",
      ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {})
    }
  });
  const client = new Client({ name: "specforge-design-fact-sync", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    const receipts = await synchronizeDesignFacts({
      manifest,
      readAdr: readRepositoryAdr,
      readExisting: async (type, id, scope) => {
        const assetType = type === "contextPack" ? "contextPack" : "proposal";
        const result = await client.callTool({ name: "get_asset_detail", arguments: { assetType, assetId: id, applicationServiceId: scope.applicationServiceId, format: "json" } });
        if (result.isError) return undefined;
        const text = Array.isArray(result.content) ? result.content.map((item) => "text" in item ? item.text : "").join("") : "";
        return (JSON.parse(text) as { asset?: Record<string, unknown> }).asset;
      },
      callTool: async (name, arguments_) => {
        const result = await client.callTool({ name, arguments: arguments_ });
        const message = Array.isArray(result.content)
          ? result.content.map((item) => "text" in item ? item.text : "").filter(Boolean).join(" ")
          : undefined;
        return { ok: !result.isError, isError: result.isError, message };
      }
    });
    console.log(JSON.stringify(receipts, null, 2));
  } finally {
    await client.close();
    await transport.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
