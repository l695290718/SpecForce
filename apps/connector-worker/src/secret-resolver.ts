export interface SecretResolver {
  resolve(reference: string): Promise<string>;
}

export interface SecretResolverOptions {
  environment?: Record<string, string | undefined>;
  dockerSecretsDirectory?: string;
}

export class EnvironmentSecretResolver implements SecretResolver {
  private readonly environment: Record<string, string | undefined>;
  private readonly dockerSecretsDirectory: string;

  constructor(options: SecretResolverOptions = {}) {
    this.environment = options.environment ?? process.env;
    this.dockerSecretsDirectory = options.dockerSecretsDirectory ?? "/run/secrets";
  }

  async resolve(reference: string): Promise<string> {
    const value = reference.trim();
    if (value.startsWith("env:")) return this.resolveEnvironment(value.slice("env:".length));
    if (value.startsWith("docker-secret:")) return this.resolveDockerSecret(value.slice("docker-secret:".length));
    throw new Error("SECRET_REFERENCE_UNSUPPORTED");
  }

  private resolveEnvironment(name: string): string {
    if (!/^[A-Z][A-Z0-9_]{0,127}$/.test(name)) throw new Error("SECRET_REFERENCE_INVALID");
    const secret = this.environment[name];
    if (!secret) throw new Error("SECRET_NOT_FOUND");
    return secret;
  }

  private async resolveDockerSecret(name: string): Promise<string> {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(name)) throw new Error("SECRET_REFERENCE_INVALID");
    const path = `${this.dockerSecretsDirectory.replace(/[\\/]+$/u, "")}/${name}`;
    try {
      const file = await import("node:fs/promises");
      const secret = (await file.readFile(path, "utf8")).trim();
      if (!secret) throw new Error("SECRET_NOT_FOUND");
      return secret;
    } catch (error) {
      if (error instanceof Error && error.message === "SECRET_NOT_FOUND") throw error;
      throw new Error("SECRET_NOT_FOUND");
    }
  }
}
