import type { GraphStore } from "@specforge/core";
import { InMemoryGraphStore } from "./in-memory";
import { PostgresGraphStore, type PostgresGraphStoreOptions, type PostgresQueryClient } from "./postgres";
import type { GraphProjectionSnapshot, TraversalOptions } from "./traversal";

export { InMemoryGraphStore } from "./in-memory";
export { PostgresGraphStore, type PostgresGraphStoreOptions, type PostgresQueryClient } from "./postgres";
export type { GraphProjectionSnapshot, TraversalOptions } from "./traversal";

export type GraphStoreConfig =
  | { kind: "memory"; initial?: GraphProjectionSnapshot; options?: TraversalOptions }
  | { kind: "postgres"; client: PostgresQueryClient; options: PostgresGraphStoreOptions };

export function createGraphStore(config: GraphStoreConfig): GraphStore {
  return config.kind === "memory"
    ? new InMemoryGraphStore(config.initial, config.options)
    : new PostgresGraphStore(config.client, config.options);
}
