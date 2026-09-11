import {
  contentDigest,
  type ArchitectureScopeRef,
  type AssetNodeIdentity,
  type AssetType,
  type FeatureChangeSetRequest,
  type FunctionalFeature,
  type RelationshipCode,
  type ServiceFeature
} from "@specforge/core";
import type { SystemKnowledgeAsset, SystemKnowledgeRelationship } from "../knowledge-readiness/read";

const areas = [
  { id: "governed-authoring", serviceId: "sf-governed-authoring", name: "Governed design authoring", zhName: "受治理的设计编写", keywords: ["adr", "proposal", "context", "decision", "governance"] },
  { id: "design-catalog-contracts", serviceId: "sf-design-catalog-contracts", name: "Design catalog and contracts", zhName: "设计目录与契约", keywords: ["asset", "catalog", "api", "contract", "model"] },
  { id: "architecture-modeling", serviceId: "sf-architecture-modeling", name: "Architecture modeling", zhName: "架构建模", keywords: ["architecture", "3a", "domain", "state"] },
  { id: "relationship-impact-analysis", serviceId: "sf-relationship-impact-analysis", name: "Relationship and impact analysis", zhName: "关系与影响分析", keywords: ["relationship", "graph", "impact", "er", "lineage"] },
  { id: "system-knowledge", serviceId: "sf-system-knowledge", name: "System knowledge and reconciliation", zhName: "系统知识与对账", keywords: ["knowledge", "readiness", "reconcile", "drift"] },
  { id: "federated-discovery", serviceId: "sf-federated-discovery", name: "Federated discovery", zhName: "联邦发现", keywords: ["federation", "connector", "scan", "observation", "integration"] },
  { id: "requirement-assessment", serviceId: "sf-requirement-assessment", name: "Requirement assessment", zhName: "需求评估", keywords: ["requirement", "assessment", "estimate", "evidence"] },
  { id: "scope-governance", serviceId: "sf-scope-governance", name: "Scope and identity governance", zhName: "范围与身份治理", keywords: ["scope", "identity", "token", "permission", "authorization"] }
] as const;

type Area = (typeof areas)[number];
type FeatureEndpoint = { nodeType: "serviceFeature" | "functionalFeature"; logicalId: string };
type DirectMapping = { assetId: string; featureId: string; featureType: FeatureEndpoint["nodeType"]; relationType: RelationshipCode };
type IndirectMapping = { assetId: string; featureId: string; featureType: FeatureEndpoint["nodeType"]; viaAssetId: string };
export type FeatureCatalogMappingException = { assetId: string; assetType: string; reason: "ONTOLOGY_DIRECT_FEATURE_LINK_UNSUPPORTED" | "NO_EVIDENCED_INDIRECT_PATH" | "GRAPH_ENDPOINT_NOT_PROJECTED" };

export interface FeatureCatalogBackfillInput {
  architectureScope: ArchitectureScopeRef;
  assets: readonly SystemKnowledgeAsset[];
  relationships: readonly SystemKnowledgeRelationship[];
  now: string;
}

export interface FeatureCatalogBackfillPlan {
  assets: FeatureChangeSetRequest["assets"];
  relationships: FeatureChangeSetRequest["relationships"];
  directMappings: DirectMapping[];
  indirectMappings: IndirectMapping[];
  exceptions: FeatureCatalogMappingException[];
  digest: string;
}

export function buildFeatureCatalogBackfillPlan(input: FeatureCatalogBackfillInput): FeatureCatalogBackfillPlan {
  const sourceAssets = input.assets.filter((asset) => asset.type !== "serviceFeature" && asset.type !== "functionalFeature")
    .filter((asset) => sameScope(asset.architectureScope, input.architectureScope)).sort(byId);
  const serviceFeatures = areas.map((area) => serviceFeature(area, input.architectureScope, input.now));
  const clusters = new Map<string, { area: Area; type: string }>();

  for (const asset of sourceAssets) {
    const area = areaFor(asset);
    const key = area.id + ":" + asset.type;
    if (!clusters.has(key)) clusters.set(key, { area, type: asset.type });
  }

  const functionalByCluster = new Map<string, FunctionalFeature>();
  for (const [key, cluster] of [...clusters.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    functionalByCluster.set(key, functionalFeature(cluster.area, cluster.type, input.architectureScope, input.now));
  }

  const relationships: FeatureChangeSetRequest["relationships"] = [];
  const directMappings: DirectMapping[] = [];
  const indirectMappings: IndirectMapping[] = [];
  const exceptions: FeatureCatalogMappingException[] = [];
  const directFeatureByAsset = new Map<string, FeatureEndpoint>();

  for (const feature of functionalByCluster.values()) {
    const area = areas.find((candidate) => feature.id.startsWith("ff-" + candidate.id + "-"))!;
    relationships.push(relation("CONTRIBUTES_TO", endpoint(input.architectureScope, "functionalFeature", feature.id), endpoint(input.architectureScope, "serviceFeature", area.serviceId)));
  }

  for (const asset of sourceAssets) {
    const area = areaFor(asset);
    const feature = functionalByCluster.get(area.id + ":" + asset.type)!;
    const mapping = directRelation(asset.type);
    if (!mapping) continue;
    const featureEndpoint: FeatureEndpoint = mapping.featureType === "serviceFeature"
      ? { nodeType: "serviceFeature", logicalId: area.serviceId }
      : { nodeType: "functionalFeature", logicalId: feature.id };
    const source = mapping.direction === "asset-to-feature"
      ? endpoint(input.architectureScope, mapping.assetNodeType, asset.id)
      : endpoint(input.architectureScope, featureEndpoint.nodeType, featureEndpoint.logicalId);
    const target = mapping.direction === "asset-to-feature"
      ? endpoint(input.architectureScope, featureEndpoint.nodeType, featureEndpoint.logicalId)
      : endpoint(input.architectureScope, mapping.assetNodeType, asset.id);
    relationships.push(relation(mapping.relationType, source, target));
    directMappings.push({ assetId: asset.id, featureId: featureEndpoint.logicalId, featureType: featureEndpoint.nodeType, relationType: mapping.relationType });
    directFeatureByAsset.set(asset.id, featureEndpoint);
  }

  for (const asset of sourceAssets.filter((candidate) => !directFeatureByAsset.has(candidate.id))) {
    const connected = input.relationships.filter((item) => sameScope(item.architectureScope, input.architectureScope))
      .flatMap((item) => item.sourceId === asset.id ? [item.targetId] : item.targetId === asset.id ? [item.sourceId] : [])
      .sort().find((id) => directFeatureByAsset.has(id));
    if (connected) {
      const feature = directFeatureByAsset.get(connected)!;
      indirectMappings.push({ assetId: asset.id, featureId: feature.logicalId, featureType: feature.nodeType, viaAssetId: connected });
    } else {
      exceptions.push({ assetId: asset.id, assetType: asset.type, reason: asset.type === "contextPack" || asset.type === "integration" ? "ONTOLOGY_DIRECT_FEATURE_LINK_UNSUPPORTED" : "NO_EVIDENCED_INDIRECT_PATH" });
    }
  }

  const plan = {
    assets: [
      ...serviceFeatures.map((asset) => ({ assetType: "serviceFeature" as const, asset })),
      ...[...functionalByCluster.values()].sort(byId).map((asset) => ({ assetType: "functionalFeature" as const, asset }))
    ],
    relationships: uniqueRelationships(relationships),
    directMappings: directMappings.sort(byAssetId),
    indirectMappings: indirectMappings.sort(byAssetId),
    exceptions: exceptions.sort(byAssetId)
  };
  return { ...plan, digest: contentDigest(plan) };
}

function serviceFeature(area: Area, architectureScope: ArchitectureScopeRef, now: string): ServiceFeature {
  return {
    id: area.serviceId, name: area.name, description: "Delivers " + area.name.toLowerCase() + " outcomes within the SpecForge application service.",
    lifecycleStatus: "ACTIVE", owner: "SpecForge Product Architecture", tags: [area.id, "feature-catalog"],
    actors: ["Architecture practitioner", "Authorized agent"], scenario: "A practitioner or authorized agent needs " + area.name.toLowerCase() + ".",
    valueOutcome: area.name + " is discoverable, governed, and traceable in one exact Scope.",
    benefitHypothesis: "Explicit value-to-behavior traceability reduces ambiguous design and change impact.",
    serviceBoundary: ["Does not grant access outside the exact application-service Scope."],
    acceptanceCriteria: ["The " + area.name + " value outcome is represented by one or more Functional Features."],
    createdAt: now, updatedAt: now, architectureScope,
    localizedContent: { zh: {
      name: area.zhName, description: "在 SpecForge 应用服务内交付" + area.zhName + "价值。", actors: ["架构实践人员", "获授权智能体"],
      scenario: "架构实践人员或获授权智能体需要" + area.zhName + "。", valueOutcome: "在单一精确 Scope 内可发现、受治理且可追溯地提供" + area.zhName + "。",
      benefitHypothesis: "明确的价值到行为追溯可以降低设计歧义和变更影响。", serviceBoundary: ["不会授予精确应用服务 Scope 之外的访问权限。"],
      acceptanceCriteria: [area.zhName + "价值结果由一个或多个功能特性表达。"]
    } }
  };
}

function functionalFeature(area: Area, assetType: string, architectureScope: ArchitectureScopeRef, now: string): FunctionalFeature {
  return {
    id: "ff-" + area.id + "-" + normalizeId(assetType), name: area.name + " " + assetType + " traceability",
    description: "Makes " + assetType + " design facts traceable for " + area.name.toLowerCase() + ".",
    lifecycleStatus: "ACTIVE", owner: "SpecForge Product Architecture", tags: [area.id, assetType, "feature-catalog"],
    trigger: "A " + assetType + " design fact is available in the exact Scope.", observableBehavior: assetType + " facts appear in the governed Feature relationship graph.",
    preconditions: ["The caller is authorized for the exact application-service Scope."],
    postconditions: ["Relevant " + assetType + " facts have an ontology-valid Feature mapping or an explicit exception."],
    exceptionBehaviors: ["The workflow reports an ontology-limited exception instead of inventing a relationship."],
    acceptanceCriteria: ["The Feature map reports traceability for the " + assetType + " cluster."],
    createdAt: now, updatedAt: now, architectureScope,
    localizedContent: { zh: {
      name: area.zhName + assetType + "追溯", description: "为" + area.zhName + "提供 " + assetType + " 设计事实追溯。",
      trigger: "精确 Scope 中存在 " + assetType + " 设计事实。", observableBehavior: assetType + " 事实出现在受治理的特性关系图中。",
      preconditions: ["调用方具有精确应用服务 Scope 授权。"], postconditions: ["相关 " + assetType + " 事实具有本体合法的特性映射或明确例外。"],
      exceptionBehaviors: ["工作流报告本体限制例外，不会虚构关系。"], acceptanceCriteria: ["特性映射报告 " + assetType + " 簇的可追溯性。"]
    } }
  };
}

function areaFor(asset: SystemKnowledgeAsset): Area {
  const haystack = (asset.type + " " + asset.id + " " + asset.name).toLowerCase();
  return areas.find((area) => area.keywords.some((keyword) => haystack.includes(keyword))) ?? areas[1];
}

function directRelation(assetType: string): {
  relationType: RelationshipCode;
  direction: "asset-to-feature" | "feature-to-asset";
  featureType: FeatureEndpoint["nodeType"];
  assetNodeType: AssetType;
} | undefined {
  switch (assetType) {
    case "domain": return { relationType: "OWNS", direction: "asset-to-feature", featureType: "serviceFeature", assetNodeType: "domain" };
    case "api": return { relationType: "EXPOSES", direction: "asset-to-feature", featureType: "functionalFeature", assetNodeType: "api" };
    case "dataModel": return { relationType: "READS", direction: "feature-to-asset", featureType: "functionalFeature", assetNodeType: "dataModel" };
    case "event": return { relationType: "CONSUMES", direction: "feature-to-asset", featureType: "functionalFeature", assetNodeType: "event" };
    case "businessRule": return { relationType: "GOVERNS", direction: "asset-to-feature", featureType: "functionalFeature", assetNodeType: "businessRule" };
    case "stateMachine": return { relationType: "CONTROLS", direction: "asset-to-feature", featureType: "functionalFeature", assetNodeType: "stateMachine" };
    case "quality": return { relationType: "VERIFIES", direction: "asset-to-feature", featureType: "functionalFeature", assetNodeType: "quality" };
    case "observability": return { relationType: "OBSERVES", direction: "asset-to-feature", featureType: "functionalFeature", assetNodeType: "observability" };
    case "adr": return { relationType: "DECIDES", direction: "asset-to-feature", featureType: "serviceFeature", assetNodeType: "adr" };
    case "proposal": return { relationType: "IMPACTS", direction: "asset-to-feature", featureType: "serviceFeature", assetNodeType: "proposal" };
    case "evidence": return { relationType: "VALIDATES", direction: "asset-to-feature", featureType: "functionalFeature", assetNodeType: "evidence" };
    default: return undefined;
  }
}

function endpoint(architectureScope: ArchitectureScopeRef, nodeType: AssetType, logicalId: string): AssetNodeIdentity {
  return { ...architectureScope, nodeType, logicalId, rootAssetType: nodeType, rootAssetId: logicalId };
}

function relation(relationType: RelationshipCode, source: FeatureChangeSetRequest["relationships"][number]["source"], target: FeatureChangeSetRequest["relationships"][number]["target"]): FeatureChangeSetRequest["relationships"][number] {
  return { relationType, source, target, confidence: 0.9, metadata: { source: "feature-catalog-backfill" } };
}

function uniqueRelationships(relationships: FeatureChangeSetRequest["relationships"]) {
  return [...new Map(relationships.map((item) => [
    item.relationType + ":" + item.source.nodeType + ":" + item.source.logicalId + ":" + item.target.nodeType + ":" + item.target.logicalId, item
  ])).values()].sort((left, right) => (left.relationType + ":" + left.source.logicalId + ":" + left.target.logicalId).localeCompare(right.relationType + ":" + right.source.logicalId + ":" + right.target.logicalId));
}

function sameScope(left: ArchitectureScopeRef, right: ArchitectureScopeRef) {
  return left.applicationServiceId === right.applicationServiceId && left.scopePath === right.scopePath;
}

function normalizeId(value: string) {
  return value.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "asset";
}

function byId<T extends { id: string }>(left: T, right: T) { return left.id.localeCompare(right.id); }
function byAssetId<T extends { assetId: string }>(left: T, right: T) { return left.assetId.localeCompare(right.assetId); }
