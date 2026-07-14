import { describe, expect, it } from "vitest";
import {
  extractAssetGraph,
  type ApiContract,
  type DataModel,
  type EventContract
} from "../index";

const scope = {
  applicationServiceId: "com.example.customer",
  scopePath: "/family/customer/com.example.customer"
};

const customerModel: DataModel = {
  id: "customer-model",
  name: "Customer model",
  description: "Stores customers.",
  code: "CUSTOMER_MODEL",
  modelType: "logical",
  domainId: "customer-domain",
  tables: ["customers"],
  entities: ["Customer"],
  fields: [
    {
      fieldName: "email",
      displayName: "Email address",
      dataType: "string",
      nullable: false,
      owner: "Customer Team"
    }
  ],
  relationships: [],
  constraints: [],
  dataClassification: "internal",
  lifecycle: "active",
  lineage: "Customer service",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T12:34:56.000Z",
  architectureScope: scope,
  localizedContent: {
    zh: {
      name: "Localized customer model",
      description: "Localized customer storage.",
      relationships: [],
      constraints: [],
      lifecycle: "localized active",
      lineage: "Localized customer service",
      fields: {
        email: {
          displayName: "Localized email address"
        }
      }
    }
  }
};

const customerQuery: ApiContract = {
  id: "customer-query",
  name: "Customer query",
  description: "Gets one customer.",
  method: "GET",
  path: "/customers/{id}",
  domainId: "customer-domain",
  providerSystem: "Customer service",
  consumers: ["Web"],
  requestSchema: {},
  responseSchema: {},
  errorCodes: [],
  openapiSpec: "openapi: 3.0.0",
  exposure: "internal",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T12:34:56.000Z",
  architectureScope: scope
};

const customerUpdated: EventContract = {
  id: "customer-updated",
  name: "Customer updated",
  description: "Signals a customer update.",
  topic: "customer.updated",
  eventType: "CustomerUpdated",
  domainId: "customer-domain",
  consumers: [],
  schema: {},
  triggerTiming: "after update",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T12:34:56.000Z",
  architectureScope: scope
};

describe("relationship extraction", () => {
  it("extracts scoped data-model, entity, and field nodes with parser containment", () => {
    const graph = extractAssetGraph("dataModel", customerModel);

    expect(graph.nodes.map((node) => node.logicalId)).toEqual([
      "customer-model",
      "customer-model.Customer",
      "customer-model.Customer.email"
    ]);
    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeType: "dataField",
          logicalId: "customer-model.Customer.email",
          parentLogicalId: "customer-model.Customer",
          rootAssetType: "dataModel",
          rootAssetId: "customer-model",
          ...scope
        })
      ])
    );
    expect(graph.relationships).toContainEqual(
      expect.objectContaining({
        code: "CONTAINS",
        source: "asset-parser",
        sourceLogicalId: "customer-model.Customer",
        targetLogicalId: "customer-model.Customer.email",
        sourceReference: "dataModel:customer-model:2026-07-14T12:34:56.000Z"
      })
    );
  });

  it("extracts a canonical API operation and an event root", () => {
    const apiGraph = extractAssetGraph("api", customerQuery);
    const eventGraph = extractAssetGraph("event", customerUpdated);

    expect(apiGraph.nodes.map((node) => node.logicalId)).toEqual([
      "customer-query",
      "customer-query.GET./customers/{id}"
    ]);
    expect(apiGraph.nodes[1]).toMatchObject({
      nodeType: "apiOperation",
      parentLogicalId: "customer-query"
    });
    expect(eventGraph.nodes).toEqual([
      expect.objectContaining({
        nodeType: "event",
        logicalId: "customer-updated",
        rootAssetType: "event",
        rootAssetId: "customer-updated"
      })
    ]);
  });

  it("does not derive graph identities or parser provenance from localized content", () => {
    const canonical = extractAssetGraph("dataModel", customerModel);
    const localized = extractAssetGraph("dataModel", {
      ...customerModel,
      name: "Translated customer model",
      localizedContent: {
        zh: {
          ...customerModel.localizedContent!.zh!,
          name: "Localized customer master model",
          description: "A different localized description.",
          fields: { email: { displayName: "Localized mailbox" } }
        }
      }
    });

    expect(localized).toEqual(canonical);
  });
});
