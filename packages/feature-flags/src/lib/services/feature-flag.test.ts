import { describe, expect, it, spyOn } from "bun:test";
import { createNoOpCache, RuntimeError } from "@deadlock-mods/common";
import { db, type FeatureFlag } from "@deadlock-mods/database";
import { createMockLogger } from "@deadlock-mods/logging";
import { err, ok } from "neverthrow";
import { FeatureFlagRepository } from "../repositories/feature-flag";
import { FeatureFlagService } from "./feature-flag";

const flag: FeatureFlag = {
  id: "feature_flag_test",
  name: "example",
  description: null,
  type: "boolean",
  value: true,
  exposed: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

function setup() {
  const logger = createMockLogger();
  const repository = new FeatureFlagRepository(db, logger);
  const cache = createNoOpCache();
  // Deserialization drops class prototypes, as a Redis cache hit does.
  cache.wrap = async (_key, load) => structuredClone(await load());
  return {
    repository,
    cache,
    service: new FeatureFlagService(logger, repository, cache),
  };
}

describe("feature flag cache serialization", () => {
  it("keeps result methods and user overrides after serialization", async () => {
    const { repository, service } = setup();
    const find = spyOn(repository, "findAll").mockResolvedValue(
      ok([
        {
          ...flag,
          userOverrides: [
            {
              id: "override_test",
              userId: "user_test",
              featureFlagId: flag.id,
              value: false,
              createdAt: new Date(0),
              updatedAt: new Date(0),
            },
          ],
        },
      ]),
    );
    try {
      const result = await service.getAllFeatureFlags({ userId: "user_test" });
      expect(result.isOk()).toBe(true);
      const client = await service.getClientFeatureFlags({
        userId: "user_test",
      });
      expect(client[0]).toMatchObject({
        name: "example",
        value: false,
        enabled: false,
      });
    } finally {
      find.mockRestore();
    }
  });

  it("returns exposed flags in a fresh result", async () => {
    const { repository, service } = setup();
    const find = spyOn(repository, "findAllExposed").mockResolvedValue(
      ok([flag]),
    );
    try {
      const result = await service.getAllExposedFeatureFlags();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value[0].name).toBe("example");
    } finally {
      find.mockRestore();
    }
  });

  it("preserves repository errors and allows the next request to recover", async () => {
    const { repository, service } = setup();
    const failure = new RuntimeError("database unavailable");
    const find = spyOn(repository, "findAll")
      .mockResolvedValueOnce(err(failure))
      .mockResolvedValue(ok([flag]));
    try {
      const first = await service.getAllFeatureFlags();
      expect(first.isErr()).toBe(true);
      if (first.isErr()) expect(first.error).toBe(failure);
      expect((await service.getAllFeatureFlags()).isOk()).toBe(true);
    } finally {
      find.mockRestore();
    }
  });
});
