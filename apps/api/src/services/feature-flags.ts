import { db } from "@deadlock-mods/database";
import {
  type FeatureFlagDefinition,
  FeatureFlagRegistry,
  FeatureFlagRepository,
  FeatureFlagService,
  SegmentRepository,
  SegmentService,
} from "@deadlock-mods/feature-flags";
import { err, ok, ResultAsync } from "neverthrow";
import { logger as mainLogger } from "../lib/logger";
import { cache } from "../lib/redis";

const logger = mainLogger.child().withContext({
  service: "feature-flags",
});

export class FeatureFlagsServiceSingleton {
  private static instance: FeatureFlagsServiceSingleton;
  private readonly featureFlagService: FeatureFlagService;
  private readonly segmentService: SegmentService;
  private readonly registry: FeatureFlagRegistry;

  constructor() {
    const featureFlagRepository = new FeatureFlagRepository(db, logger);
    const segmentRepository = new SegmentRepository(db, logger);

    this.segmentService = new SegmentService(segmentRepository, cache);
    this.featureFlagService = new FeatureFlagService(
      logger,
      featureFlagRepository,
      cache,
      this.segmentService,
    );
    this.registry = new FeatureFlagRegistry(this.featureFlagService, logger);
  }

  static getInstance(): FeatureFlagsServiceSingleton {
    if (!FeatureFlagsServiceSingleton.instance) {
      FeatureFlagsServiceSingleton.instance =
        new FeatureFlagsServiceSingleton();
    }
    return FeatureFlagsServiceSingleton.instance;
  }

  isFeatureEnabled(
    featureFlagName: string,
    userId?: string,
  ): ResultAsync<boolean, Error> {
    return ResultAsync.fromPromise(
      this.featureFlagService.isFeatureFlagEnabled(featureFlagName, {
        shouldThrow: false,
        userId,
      }),
      (error) => error as Error,
    ).mapErr((error) => {
      logger
        .withError(error)
        .withMetadata({ featureFlagName, userId })
        .warn("Failed to check feature flag");
      return error;
    });
  }

  getAllFeatureFlags(options?: { userId?: string }) {
    return ResultAsync.fromPromise(
      this.featureFlagService.getAllFeatureFlags(options),
      (error) => error as Error,
    ).mapErr((error) => {
      logger.withError(error).warn("Failed to get all feature flags");
      return error;
    });
  }

  getClientFeatureFlags(options?: { userId?: string }) {
    return ResultAsync.fromPromise(
      this.featureFlagService.getClientFeatureFlags(options),
      (error) => error as Error,
    ).mapErr((error) => {
      logger.withError(error).warn("Failed to get client feature flags");
      return error;
    });
  }

  getAllExposedFeatureFlags() {
    return ResultAsync.fromPromise(
      this.featureFlagService.getAllExposedFeatureFlags(),
      (error) => error as Error,
    ).mapErr((error) => {
      logger.withError(error).warn("Failed to get all exposed feature flags");
      return error;
    });
  }

  getService(): FeatureFlagService {
    return this.featureFlagService;
  }

  getSegmentService(): SegmentService {
    return this.segmentService;
  }

  bootstrap(definitions: FeatureFlagDefinition[]): ResultAsync<number, Error> {
    return ResultAsync.fromPromise(
      this.registry.bootstrap(definitions),
      (error) => error as Error,
    );
  }

  addUserToSegment(segmentId: string, userId: string) {
    return this.segmentService.addUserToSegment(segmentId, userId);
  }

  removeUserFromSegment(segmentId: string, userId: string) {
    return this.segmentService.removeUserFromSegment(segmentId, userId);
  }

  setSegmentOverride(segmentId: string, featureFlagId: string, value: unknown) {
    return this.segmentService.createSegmentFeatureFlagOverride(
      segmentId,
      featureFlagId,
      value,
    );
  }

  getFeatureFlagValue<T = unknown>(
    featureFlagName: string,
    userId?: string,
    shouldThrow?: boolean,
  ): ResultAsync<T, Error> {
    return ResultAsync.fromPromise(
      this.featureFlagService.getFeatureFlagValue<T>(featureFlagName, {
        shouldThrow: shouldThrow ?? false,
        userId,
      }),
      (error) => error as Error,
    ).mapErr((error) => {
      logger
        .withError(error)
        .withMetadata({ featureFlagName, userId })
        .warn("Failed to get feature flag value");
      return error;
    });
  }

  setUserOverride(userId: string, featureFlagId: string, value: unknown) {
    return ResultAsync.fromPromise(
      this.featureFlagService.setUserOverride(userId, featureFlagId, value),
      (error) => error as Error,
    )
      .andThen((result) => {
        if (result.isErr()) {
          return err(result.error);
        }
        return ok(result.value);
      })
      .mapErr((error) => {
        logger.withError(error).warn("Failed to set user override");
        return error;
      });
  }

  deleteUserOverride(userId: string, featureFlagId: string) {
    return ResultAsync.fromPromise(
      this.featureFlagService.deleteUserOverride(userId, featureFlagId),
      (error) => error as Error,
    )
      .andThen((result) => {
        if (result.isErr()) {
          return err(result.error);
        }
        return ok(result.value);
      })
      .mapErr((error) => {
        logger.withError(error).warn("Failed to delete user override");
        return error;
      });
  }
}

export const featureFlagsService = FeatureFlagsServiceSingleton.getInstance();
