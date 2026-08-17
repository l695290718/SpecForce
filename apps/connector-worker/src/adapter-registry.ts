import type { ConnectorV2SourceAdapter } from "@specforge/core";
import type { SecretResolver } from "./secret-resolver";

export type ConnectorAdapterFactory = (input: {
  configuration: Record<string, unknown>;
  secrets: SecretResolver;
}) => ConnectorV2SourceAdapter;

export interface ConnectorAdapterRegistration {
  kind: string;
  contractVersion: string;
  mappingVersions: readonly string[];
  factory: ConnectorAdapterFactory;
}

export class ConnectorAdapterRegistry {
  private readonly registrations = new Map<string, ConnectorAdapterRegistration>();

  register(registration: ConnectorAdapterRegistration): void {
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(registration.kind)) throw new Error("CONNECTOR_KIND_INVALID");
    if (!registration.contractVersion || registration.mappingVersions.length === 0) throw new Error("CONNECTOR_REGISTRATION_INVALID");
    const key = `${registration.kind}:${registration.contractVersion}`;
    if (this.registrations.has(key)) throw new Error("CONNECTOR_REGISTRATION_DUPLICATE");
    this.registrations.set(key, registration);
  }

  create(input: { kind: string; contractVersion: string; mappingVersion: string; configuration: Record<string, unknown>; secrets: SecretResolver }): ConnectorV2SourceAdapter {
    const registration = this.registrations.get(`${input.kind}:${input.contractVersion}`);
    if (!registration) throw new Error("CONNECTOR_ADAPTER_UNSUPPORTED");
    if (!registration.mappingVersions.includes(input.mappingVersion)) throw new Error("CONNECTOR_MAPPING_UNSUPPORTED");
    const adapter = registration.factory({ configuration: input.configuration, secrets: input.secrets });
    if (adapter.kind !== input.kind) throw new Error("CONNECTOR_ADAPTER_KIND_MISMATCH");
    return adapter;
  }
}
