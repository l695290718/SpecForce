import { z } from "zod";

const identity = {
  scope: z.string().min(1).max(256),
  baselineId: z.string().min(1).max(256),
  projectionManifestId: z.string().min(1).max(256)
};

const architectureMapFilter = z.object({
  layers: z.array(z.enum(["BIZ", "SYS", "TECH"])).max(3).optional(),
  kinds: z.array(z.enum(["CAPABILITY", "PROCESS", "BUSINESS_OBJECT", "APPLICATION", "SERVICE", "COMPONENT", "DATA_DOMAIN", "PLATFORM", "RUNTIME", "INFRASTRUCTURE", "TECHNOLOGY_SERVICE"])).max(20).optional(),
  mappingFamilies: z.array(z.string().min(1).max(64)).max(20).optional(),
  minCriticality: z.number().min(0).max(1).optional(),
  minCompleteness: z.number().min(0).max(1).optional(),
  includeUnclassified: z.boolean().optional(),
  query: z.string().max(256).optional()
});

const architectureMapBudget = z.object({
  maxUnitsPerLayer: z.number().int().positive().max(12).optional(),
  maxMappings: z.number().int().positive().max(60).optional(),
  timeoutMs: z.number().int().positive().max(2_000).optional(),
  maxPayloadBytes: z.number().int().positive().max(524_288).optional()
});

const unitGraphBudget = architectureMapBudget.extend({
  maxMembers: z.number().int().positive().max(500).optional(),
  maxMemberRelations: z.number().int().positive().max(120).optional()
});

export const graphAnalysisBudgetSchema = z.object({
  maxNodes: z.number().int().positive().optional(),
  maxEdges: z.number().int().positive().optional(),
  maxPaths: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  maxPayloadBytes: z.number().int().positive().optional()
});

export const threeAWebQuerySchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("search"), ...identity, layer: z.enum(["BIZ", "SYS", "TECH"]), query: z.string().max(256).optional(), limit: z.number().int().min(1).max(50).default(20), cursor: z.string().max(4096).optional() }),
  z.object({ operation: z.literal("trace"), ...identity, startAssertionId: z.string().min(1).max(256), direction: z.enum(["upstream", "downstream", "both"]), relationTypes: z.array(z.string().min(1).max(64)).max(20).default([]), layers: z.array(z.enum(["BIZ", "SYS", "TECH"])).max(3).default([]), continuation: z.string().max(4096).optional() }),
  z.object({ operation: z.literal("detail"), ...identity, assertionId: z.string().min(1).max(256) }),
  z.object({ operation: z.literal("overview"), ...identity, layers: z.array(z.enum(["BIZ", "SYS", "TECH"])).max(3).default([]), assetTypes: z.array(z.string().min(1).max(64)).max(20).default([]), relationTypes: z.array(z.string().min(1).max(64)).max(20).default([]), continuation: z.string().max(4096).optional(), budget: graphAnalysisBudgetSchema.optional() }),
  z.object({ operation: z.literal("impact"), ...identity, focusAssertionId: z.string().min(1).max(256), direction: z.enum(["upstream", "downstream", "both"]), layers: z.array(z.enum(["BIZ", "SYS", "TECH"])).max(3).default([]), relationTypes: z.array(z.string().min(1).max(64)).max(20).default([]), policyVersion: z.string().max(64).optional(), continuation: z.string().max(4096).optional(), budget: graphAnalysisBudgetSchema.optional() }),
  z.object({ operation: z.literal("architectureMap"), ...identity, generationId: z.string().min(1).max(256), filter: architectureMapFilter.optional(), budget: architectureMapBudget.optional(), continuation: z.string().max(4096).optional() }),
  z.object({ operation: z.literal("unitGraph"), ...identity, generationId: z.string().min(1).max(256), includeMembers: z.boolean().optional(), includeMemberRelations: z.boolean().optional(), filter: architectureMapFilter.optional(), budget: unitGraphBudget.optional(), continuation: z.string().max(4096).optional() }),
  z.object({ operation: z.literal("architectureUnitNeighborhood"), ...identity, generationId: z.string().min(1).max(256), unitIdentity: z.string().startsWith("unit:").max(256), direction: z.enum(["upstream", "downstream", "both"]).default("both"), depth: z.number().int().min(1).max(3).default(1), memberAssetTypes: z.array(z.string().min(1).max(64)).max(20).optional(), mappingFamilies: z.array(z.string().min(1).max(64)).max(20).optional(), continuation: z.string().max(4096).optional(), budget: architectureMapBudget.optional() })
]);

export type ThreeAWebQuery = z.infer<typeof threeAWebQuerySchema>;
