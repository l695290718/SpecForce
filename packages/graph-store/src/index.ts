import type { GraphStore } from "@specforge/core";
import { InMemoryGraphStore } from "./in-memory";
import {
  NebulaGatewayGraphStore,
  type NebulaGatewayGraphStoreOptions
} from "./nebula-gateway";
import { PostgresGraphStore, type PostgresGraphStoreOptions, type PostgresQueryClient } from "./postgres";
import type { GraphProjectionSnapshot, TraversalOptions } from "./traversal";

export { InMemoryGraphStore } from "./in-memory";
export {
  GraphGatewayUnavailableError,
  NebulaGatewayGraphStore,
  type NebulaGatewayGraphStoreOptions
} from "./nebula-gateway";
export { PostgresGraphStore, type PostgresGraphStoreOptions, type PostgresQueryClient } from "./postgres";
export type { GraphProjectionSnapshot, TraversalOptions } from "./traversal";

export type GraphStoreConfig =
  | { kind: "memory"; initial?: GraphProjectionSnapshot; options?: TraversalOptions }
  | { kind: "postgres"; client: PostgresQueryClient; options: PostgresGraphStoreOptions }
  | ({ kind: "nebula" } & NebulaGatewayGraphStoreOptions);

export function createGraphStore(config: GraphStoreConfig): GraphStore {
  if (config.kind === "memory") return new InMemoryGraphStore(config.initial, config.options);
  if (config.kind === "nebula") return new NebulaGatewayGraphStore(config);
  return new PostgresGraphStore(config.client, config.options);
}
