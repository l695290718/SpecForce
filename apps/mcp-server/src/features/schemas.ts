import { z } from "zod";

export const featureAssetTypeSchema = z.enum(["serviceFeature", "functionalFeature"]);
export const featureLifecycleSchema = z.enum(["DRAFT", "ACTIVE", "DEPRECATED", "RETIRED"]);
export const featureScopeSchema = z.object({ applicationServiceId: z.string().min(1), scopePath: z.string().min(1) }).strict();
const commonOverlay = { name: z.string().min(1), description: z.string().min(1), acceptanceCriteria: z.array(z.string().min(1)).min(1) };
const common = {
  id: z.string().min(1), name: z.string().min(1), description: z.string().min(1), domainId: z.string().min(1).optional(),
  lifecycleStatus: featureLifecycleSchema, owner: z.string().min(1).optional(), tags: z.array(z.string().min(1)), acceptanceCriteria: z.array(z.string().min(1)).min(1),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(), architectureScope: featureScopeSchema
};
export const serviceFeatureSchema = z.object({
  ...common,
  actors: z.array(z.string().min(1)).min(1), scenario: z.string().min(1), valueOutcome: z.string().min(1), benefitHypothesis: z.string().min(1), serviceBoundary: z.array(z.string().min(1)).min(1),
  localizedContent: z.object({ zh: z.object({ ...commonOverlay, actors: z.array(z.string().min(1)).min(1), scenario: z.string().min(1), valueOutcome: z.string().min(1), benefitHypothesis: z.string().min(1), serviceBoundary: z.array(z.string().min(1)).min(1) }).strict() }).strict()
}).strict();
export const functionalFeatureSchema = z.object({
  ...common,
  trigger: z.string().min(1), observableBehavior: z.string().min(1), preconditions: z.array(z.string().min(1)), postconditions: z.array(z.string().min(1)).min(1), exceptionBehaviors: z.array(z.string().min(1)),
  localizedContent: z.object({ zh: z.object({ ...commonOverlay, trigger: z.string().min(1), observableBehavior: z.string().min(1), preconditions: z.array(z.string().min(1)), postconditions: z.array(z.string().min(1)).min(1), exceptionBehaviors: z.array(z.string().min(1)) }).strict() }).strict()
}).strict();
const nodeTypeSchema = z.enum(["domain", "dataModel", "dataEntity", "dataField", "api", "apiOperation", "event", "businessRule", "stateMachine", "integration", "quality", "observability", "adr", "proposal", "contextPack", "evidence", "applicationService", "serviceFeature", "functionalFeature"]);
const relationshipCodeSchema = z.enum(["OWNS", "PROVIDES", "CONSUMES", "READS", "WRITES", "REFERENCES", "CONTAINS", "EMITS", "SUBSCRIBES", "CARRIES", "GOVERNS", "CONTROLS", "VERIFIES", "OBSERVES", "DECIDES", "IMPACTS", "GENERATES", "CALLS", "RECORDS", "EMITTED_BY", "CONNECTS_TO", "REQUIRES", "USES", "IMPLEMENTS_CONTEXT_FOR", "IMPLEMENTS_DECISION", "VALIDATES", "CONTRIBUTES_TO", "EXPOSES"]);
const endpointSchema = z.object({ applicationServiceId: z.string().min(1), scopePath: z.string().min(1), nodeType: nodeTypeSchema, logicalId: z.string().min(1), rootAssetType: featureAssetTypeSchema.or(z.enum(["domain", "dataModel", "api", "event", "businessRule", "stateMachine", "integration", "quality", "observability", "adr", "proposal", "contextPack", "evidence"])), rootAssetId: z.string().min(1), parentLogicalId: z.string().min(1).optional() }).strict();

export const applyFeatureChangeSetShape = {
  architectureScope: featureScopeSchema,
  designChangeSessionId: z.string().min(1), correlationId: z.string().min(1), idempotencyKey: z.string().min(1).max(256), dryRun: z.boolean().optional(),
  assets: z.array(z.discriminatedUnion("assetType", [z.object({ assetType: z.literal("serviceFeature"), asset: serviceFeatureSchema, expectedVersion: z.string().regex(/^\d+$/u).optional() }).strict(), z.object({ assetType: z.literal("functionalFeature"), asset: functionalFeatureSchema, expectedVersion: z.string().regex(/^\d+$/u).optional() }).strict()])).max(100),
  relationships: z.array(z.object({ relationType: relationshipCodeSchema, source: endpointSchema, target: endpointSchema, confidence: z.number().min(0).max(1).optional(), metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).optional() }).strict()).max(1000)
};

export const featureListShape = { architectureScope: featureScopeSchema, kind: featureAssetTypeSchema.optional(), query: z.string().max(200).optional(), locale: z.enum(["en", "zh"]).optional(), limit: z.number().int().min(1).max(100).optional(), cursor: z.string().max(4096).optional() };
export const featureDetailShape = { architectureScope: featureScopeSchema, assetId: z.string().min(1), locale: z.enum(["en", "zh"]).optional() };
export const featureGraphShape = { architectureScope: featureScopeSchema, root: z.object({ nodeType: nodeTypeSchema, logicalId: z.string().min(1) }).strict(), depth: z.number().int().min(1).max(3).optional(), limit: z.number().int().min(1).max(500).optional() };
