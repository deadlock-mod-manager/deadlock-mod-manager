import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import {
  createNoOpCache,
  DatabaseConnectionError,
  EntityNotFoundError,
  UnknownError,
} from "@deadlock-mods/common";
import { db, type FeatureFlag } from "@deadlock-mods/database";
import { createMockLogger } from "@deadlock-mods/logging";
import { err, ok } from "neverthrow";
import { FeatureFlagRepository } from "../repositories/feature-flag";
import { FeatureFlagService } from "./feature-flag";
import { FeatureFlagRegistry } from "./feature-flag-registry";

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
  const service = new FeatureFlagService(logger, repository, createNoOpCache());
  const find = spyOn(service, "findByName").mockResolvedValue(ok(flag));
  const create = spyOn(service, "createFeatureFlag").mockResolvedValue(
    ok(flag),
  );
  return { find, create, registry: new FeatureFlagRegistry(service, logger) };
}

afterEach(() => mock.restore());

describe("feature flag registration", () => {
  it("preserves existing flag settings", async () => {
    const { registry, create } = setup();
    const result = await registry.register({
      name: flag.name,
      defaultValue: false,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBe(flag);
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a flag only when the lookup confirms it is missing", async () => {
    const { registry, find, create } = setup();
    find.mockResolvedValue(
      err(new EntityNotFoundError("Feature flag", flag.name)),
    );
    expect((await registry.register({ name: flag.name })).isOk()).toBe(true);
    expect(create).toHaveBeenCalledWith({
      name: flag.name,
      description: undefined,
      type: "boolean",
      value: false,
      exposed: false,
    });
  });

  it("does not attempt an insert when the database lookup fails", async () => {
    const { registry, find, create } = setup();
    const failure = new DatabaseConnectionError("database unavailable");
    find.mockResolvedValue(err(failure));
    const result = await registry.register({ name: flag.name });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe(failure);
    expect(create).not.toHaveBeenCalled();
  });

  it("preserves failures from creating a missing flag", async () => {
    const { registry, find, create } = setup();
    const failure = new DatabaseConnectionError("database unavailable");
    find.mockResolvedValue(err(new EntityNotFoundError()));
    create.mockResolvedValue(err(failure));
    const result = await registry.register({ name: flag.name });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe(failure);
  });

  it("normalizes unexpected thrown values into errors", async () => {
    const { registry, find, create } = setup();
    find.mockRejectedValue("database unavailable");
    const result = await registry.register({ name: flag.name });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBeInstanceOf(UnknownError);
    expect(create).not.toHaveBeenCalled();
  });
});
