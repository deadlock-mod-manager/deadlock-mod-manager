import { db } from "@deadlock-mods/database";
import {
  type FeatureFlagDefinition,
  FeatureFlagRegistry,
  FeatureFlagRepository,
  FeatureFlagService,
} from "@deadlock-mods/feature-flags";
import { ResultAsync } from "neverthrow";
import { logger as mainLogger } from "@/lib/logger";
import { cache } from "@/lib/redis";

const logger = mainLogger.child().withContext({
  service: "feature-flags",
});

export class FeatureFlagsService {
  static #instance: FeatureFlagsService;
  private readonly featureFlagService: FeatureFlagService;
  private readonly registry: FeatureFlagRegistry;

  constructor() {
    const featureFlagRepository = new FeatureFlagRepository(db, logger);

    this.featureFlagService = new FeatureFlagService(
      logger,
      featureFlagRepository,
      cache,
    );
    this.registry = new FeatureFlagRegistry(this.featureFlagService, logger);
  }

  static get instance(): FeatureFlagsService {
    if (!FeatureFlagsService.#instance) {
      FeatureFlagsService.#instance = new FeatureFlagsService();
    }
    return FeatureFlagsService.#instance;
  }

  getService(): FeatureFlagService {
    return this.featureFlagService;
  }

  bootstrap(definitions: FeatureFlagDefinition[]): ResultAsync<number, Error> {
    return ResultAsync.fromPromise(
      this.registry.bootstrap(definitions),
      (error) => error as Error,
    );
  }

  getFeatureFlagValue<T = unknown>(
    featureFlagName: string,
    shouldThrow?: boolean,
  ): ResultAsync<T, Error> {
    return ResultAsync.fromPromise(
      this.featureFlagService.getFeatureFlagValue<T>(featureFlagName, {
        shouldThrow: shouldThrow ?? false,
      }),
      (error) => error as Error,
    ).mapErr((error) => {
      logger
        .withError(error)
        .withMetadata({ featureFlagName })
        .warn("Failed to get feature flag value");
      return error;
    });
  }
}
