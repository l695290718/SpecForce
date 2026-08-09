import {
  ConnectorRuntime,
  type ArchitectureScopeRef,
  type ConnectorRuntimeOptions,
  type ConnectorSourceAdapter
} from "@specforge/core";
import { getContinuousObservationCursor, submitContinuousObservationBatch } from "../federation/continuous-persistence";
import { listConnectors } from "../federation/persistence";

export interface McpConnectorRuntimeOptions extends Omit<ConnectorRuntimeOptions, "gateway"> {
  source: ConnectorSourceAdapter;
}

export function createMcpConnectorRuntime(options: McpConnectorRuntimeOptions): ConnectorRuntime {
  return new ConnectorRuntime({
    ...options,
    gateway: {
      getConnector: async (architectureScope, connectorId) => {
        const connectors = await listConnectors(architectureScope);
        return connectors.find((connector) => connector.id === connectorId) ?? null;
      },
      getCursor: async (architectureScope, connectorId, sourceNamespace) => {
        const cursor = await getContinuousObservationCursor(architectureScope, connectorId, sourceNamespace);
        return cursor ? {
          contractVersion: cursor.contractVersion,
          acceptedSequence: cursor.acceptedSequence,
          acceptedBatchDigest: cursor.acceptedBatchDigest,
          sourceCursor: cursor.sourceCursor
        } : null;
      },
      submitBatch: submitContinuousObservationBatch
    }
  });
}

export function assertConnectorScope(expected: ArchitectureScopeRef, actual: ArchitectureScopeRef): void {
  if (expected.applicationServiceId !== actual.applicationServiceId || expected.scopePath !== actual.scopePath) throw new Error("SCOPE_MISMATCH");
}
