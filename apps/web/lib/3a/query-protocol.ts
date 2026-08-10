import { z } from "zod";

const identity = {
  scope: z.string().min(1).max(256),
  baselineId: z.string().min(1).max(256),
  projectionManifestId: z.string().min(1).max(256)
};

export const threeAWebQuerySchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("search"), ...identity, layer: z.enum(["BIZ", "SYS", "TECH"]), query: z.string().max(256).optional(), limit: z.number().int().min(1).max(50).default(20), cursor: z.string().max(4096).optional() }),
  z.object({ operation: z.literal("trace"), ...identity, startAssertionId: z.string().min(1).max(256), direction: z.enum(["upstream", "downstream", "both"]), relationTypes: z.array(z.string().min(1).max(64)).max(20).default([]), layers: z.array(z.enum(["BIZ", "SYS", "TECH"])).max(3).default([]), continuation: z.string().max(4096).optional() }),
  z.object({ operation: z.literal("detail"), ...identity, assertionId: z.string().min(1).max(256) })
]);

export type ThreeAWebQuery = z.infer<typeof threeAWebQuerySchema>;
