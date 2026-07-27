import {
  GraphGatewayUnavailableError,
  NebulaGatewayGraphStore,
  PostgresGraphStore
} from "@specforge/graph-store";
import type { GraphStore } from "@specforge/core";
import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createImpactAnalysisWorkerFromEnvironment, graphStoreConfigFromEnvironment } from "./index";

const enterpriseId = "enterprise-huawei";
const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

describe("graphStoreConfigFromEnvironment", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects the Nebula selector when the Gateway URL is absent", () => {
    expect(() => graphStoreConfigFromEnvironment({
      NODE_ENV: "production",
      SPECFORGE_GRAPH_STORE: "nebula",
      SPECFORGE_ENTERPRISE_ID: enterpriseId
    })).toThrow("SPECFORGE_GRAPH_GATEWAY_URL_REQUIRED");
  });

  it("returns validated Nebula Gateway configuration", () => {
    expect(graphStoreConfigFromEnvironment({
      NODE_ENV: "production",
      SPECFORGE_GRAPH_STORE: "nebula",
      SPECFORGE_GRAPH_GATEWAY_URL: "https://graph-gateway.internal/",
      SPECFORGE_ENTERPRISE_ID: enterpriseId
    })).toEqual({
      kind: "nebula",
      baseUrl: "https://graph-gateway.internal",
      enterpriseId
    });
  });

  it("rejects a malformed Nebula Gateway URL", () => {
    expect(() => graphStoreConfigFromEnvironment({
      NODE_ENV: "production",
      SPECFORGE_GRAPH_STORE: "nebula",
      SPECFORGE_GRAPH_GATEWAY_URL: "not a URL",
      SPECFORGE_ENTERPRISE_ID: enterpriseId
    })).toThrow("SPECFORGE_GRAPH_GATEWAY_URL_INVALID");
  });

  it("returns PostgreSQL configuration for the explicit fallback selector", () => {
    expect(graphStoreConfigFromEnvironment({
      NODE_ENV: "production",
      SPECFORGE_GRAPH_STORE: "postgres",
      SPECFORGE_ENTERPRISE_ID: enterpriseId
    })).toEqual({ kind: "postgres", enterpriseId });
  });

  it("wires the explicit PostgreSQL selector to the PostgreSQL graph store", () => {
    const worker = createImpactAnalysisWorkerFromEnvironment(
      {} as PrismaClient,
      {
        NODE_ENV: "production",
        SPECFORGE_GRAPH_STORE: "postgres",
        SPECFORGE_ENTERPRISE_ID: enterpriseId
      }
    );

    expect(graphStoreOf(worker)).toBeInstanceOf(PostgresGraphStore);
  });

  it("defaults to PostgreSQL only in local development", () => {
    expect(graphStoreConfigFromEnvironment({
      NODE_ENV: "development",
      SPECFORGE_ENTERPRISE_ID: enterpriseId
    })).toEqual({ kind: "postgres", enterpriseId });

    expect(() => graphStoreConfigFromEnvironment({
      NODE_ENV: "production",
      SPECFORGE_ENTERPRISE_ID: enterpriseId
    })).toThrow("SPECFORGE_GRAPH_STORE_REQUIRED");
  });

  it("does not fall back to PostgreSQL after a Nebula Gateway failure", async () => {
    const query = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("connection refused");
    }));
    const worker = createImpactAnalysisWorkerFromEnvironment(
      { $queryRawUnsafe: query } as unknown as PrismaClient,
      {
        NODE_ENV: "production",
        SPECFORGE_GRAPH_STORE: "nebula",
        SPECFORGE_GRAPH_GATEWAY_URL: "https://graph-gateway.internal",
        SPECFORGE_ENTERPRISE_ID: enterpriseId
      }
    );
    const graphStore = graphStoreOf(worker);

    expect(graphStore).toBeInstanceOf(NebulaGatewayGraphStore);
    await expect(graphStore.checkpoint(scope)).rejects.toMatchObject({ code: "GRAPH_GATEWAY_UNAVAILABLE" });
    expect(query).not.toHaveBeenCalled();
    await expect(graphStore.checkpoint(scope)).rejects.toBeInstanceOf(GraphGatewayUnavailableError);
  });
});

function graphStoreOf(worker: unknown): Pick<GraphStore, "checkpoint"> {
  return (worker as { graphStore: Pick<GraphStore, "checkpoint"> }).graphStore;
}
