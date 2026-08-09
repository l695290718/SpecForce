import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalRepositorySourceAdapter } from "./local-repository";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "designer" };
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("LocalRepositorySourceAdapter", () => {
  it("produces deterministic paged observations and resumes from its source cursor", async () => {
    const root = await fixture();
    const adapter = new LocalRepositorySourceAdapter({ root, architectureScope: scope });
    const first = await adapter.poll({ architectureScope: scope, checkpoint: null, maxObservations: 1 });
    const second = await adapter.poll({ architectureScope: scope, checkpoint: { contractVersion: "continuous-observation/v1", acceptedSequence: 0, acceptedBatchDigest: "digest-0", sourceCursor: first.sourceCursor }, maxObservations: 1 });
    const retry = await adapter.poll({ architectureScope: scope, checkpoint: null, maxObservations: 1 });

    expect(first.observations).toHaveLength(1);
    expect(first.hasMore).toBe(true);
    expect(second.observations).toHaveLength(1);
    expect(second.sourceCursor).not.toBe(first.sourceCursor);
    expect(retry).toEqual(first);
    expect(first.observations[0]).toMatchObject({ externalAssetType: "api-contract", sourceVersion: expect.any(String) });
  });

  it("returns an empty terminal page when the persisted source cursor is complete", async () => {
    const root = await fixture();
    const adapter = new LocalRepositorySourceAdapter({ root, architectureScope: scope });
    const first = await adapter.poll({ architectureScope: scope, checkpoint: null, maxObservations: 50 });
    const terminal = await adapter.poll({ architectureScope: scope, checkpoint: { contractVersion: "continuous-observation/v1", acceptedSequence: 0, acceptedBatchDigest: "digest-0", sourceCursor: first.sourceCursor }, maxObservations: 50 });

    expect(first.hasMore).toBe(false);
    expect(terminal.observations).toEqual([]);
    expect(terminal.hasMore).toBe(false);
    expect(terminal.sourceCursor).toBe(first.sourceCursor);
  });

  it("rejects a Scope different from the adapter registration", async () => {
    const root = await fixture();
    const adapter = new LocalRepositorySourceAdapter({ root, architectureScope: scope });

    await expect(adapter.poll({ architectureScope: { applicationServiceId: "com.huawei.celon.policyhub", scopePath: "policy" }, checkpoint: null, maxObservations: 10 })).rejects.toThrow("SCOPE_MISMATCH");
  });
});

async function fixture(): Promise<string> {
  const root = join(process.cwd(), ".tmp-local-repository-connector");
  roots.push(root);
  await rm(root, { recursive: true, force: true });
  await mkdir(join(root, "api"), { recursive: true });
  await writeFile(join(root, "api", "openapi.yaml"), "openapi: 3.0.0\ninfo:\n  title: Orders\n  version: 1.0.0\npaths: {}\n", "utf8");
  await writeFile(join(root, "README.md"), "# Orders\n", "utf8");
  return root;
}
