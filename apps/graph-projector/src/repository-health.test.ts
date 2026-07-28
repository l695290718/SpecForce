import { describe, expect, it, vi } from "vitest";
import { PrismaProjectionRepository } from "./repository.js";

const scope = {
  enterpriseId: "enterprise-1",
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

describe("PrismaProjectionRepository health", () => {
  it("normalizes exact-scope operational metrics", async () => {
    const query = vi.fn(async () => [{
      backlog: 5,
      oldest_pending_age_seconds: 12.9,
      last_checkpoint: 23n,
      retry_count: 4,
      dead_letter_count: 2
    }]);
    const repository = new PrismaProjectionRepository({
      $queryRawUnsafe: query
    } as never);
    const now = new Date("2026-07-28T10:00:00.000Z");

    await expect(repository.health(scope, now)).resolves.toEqual({
      backlog: 5,
      oldestPendingAgeSeconds: 12,
      lastCheckpoint: 23n,
      retryCount: 4,
      deadLetterCount: 2
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE outbox."enterpriseId" = $1'),
      scope.enterpriseId,
      scope.applicationServiceId,
      scope.scopePath,
      now
    );
  });
});
