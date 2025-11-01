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

    this.segmentService = new SegmentService(segmentRepository);
    this.featureFlagService = new FeatureFlagService(
      logger,
      featureFlagRepository,
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

  /**
   * Check if a feature flag is enabled by name
   *
   * @param featureFlagName - The name of the feature flag
   * @param userId - Optional user ID for segment-based overrides
   * @returns Result with boolean indicating if the feature flag is enabled
   */
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

  /**
   * Get all feature flags
   */
  getAllFeatureFlags(options?: { userId?: string }) {
    return ResultAsync.fromPromise(
      this.featureFlagService.getAllFeatureFlags(options),
      (error) => error as Error,
    )
      .andThen((result) => {
        if (result.isErr()) {
          return err(result.error);
        }
        return ok(result.value);
      })
      .mapErr((error) => {
        logger.withError(error).warn("Failed to get all feature flags");
        return error;
      });
  }

  /**
   * Get all feature flags formatted for client consumption with user-specific overrides applied
   */
  getClientFeatureFlags(options?: { userId?: string }) {
    return ResultAsync.fromPromise(
      this.featureFlagService.getClientFeatureFlags(options),
      (error) => error as Error,
    )
      .andThen((result) => {
        if (result.isErr()) {
          return err(result.error);
        }
        return ok(result.value);
      })
      .mapErr((error) => {
        logger.withError(error).warn("Failed to get client feature flags");
        return error;
      });
  }

  /**
   * Get all exposed feature flags
   */
  getAllExposedFeatureFlags() {
    return ResultAsync.fromPromise(
      this.featureFlagService.getAllExposedFeatureFlags(),
      (error) => error as Error,
    )
      .andThen((result) => {
        if (result.isErr()) {
          return err(result.error);
        }
        return ok(result.value);
      })
      .mapErr((error) => {
        logger.withError(error).warn("Failed to get all exposed feature flags");
        return error;
      });
  }

  /**
   * Get the underlying feature flag service for advanced operations
   */
  getService(): FeatureFlagService {
    return this.featureFlagService;
  }

  /**
   * Get the segment service for segment operations
   */
  getSegmentService(): SegmentService {
    return this.segmentService;
  }

  /**
   * Bootstrap feature flags by registering definitions
   *
   * @param definitions - Array of feature flag definitions to register
   * @returns Result with number of successfully registered flags
   */
  bootstrap(definitions: FeatureFlagDefinition[]): ResultAsync<number, Error> {
    return ResultAsync.fromPromise(
      this.registry.bootstrap(definitions),
      (error) => error as Error,
    );
  }

  /**
   * Add a user to a segment
   *
   * @param segmentId - The ID of the segment
   * @param userId - The ID of the user
   */
  addUserToSegment(segmentId: string, userId: string) {
    return this.segmentService.addUserToSegment(segmentId, userId);
  }

  /**
   * Remove a user from a segment
   *
   * @param segmentId - The ID of the segment
   * @param userId - The ID of the user
   */
  removeUserFromSegment(segmentId: string, userId: string) {
    return this.segmentService.removeUserFromSegment(segmentId, userId);
  }

  /**
   * Create or update a segment feature flag override
   *
   * @param segmentId - The ID of the segment
   * @param featureFlagId - The ID of the feature flag
   * @param value - The override value
   */
  setSegmentOverride(segmentId: string, featureFlagId: string, value: unknown) {
    return this.segmentService.createSegmentFeatureFlagOverride(
      segmentId,
      featureFlagId,
      value,
    );
  }

  /**
   * Get a feature flag value with type support
   *
   * @param featureFlagName - The name of the feature flag
   * @param userId - Optional user ID for segment-based overrides
   * @returns Result with the feature flag value
   */
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

  /**
   * Set user override for a feature flag
   *
   * @param userId - The id of the user
   * @param featureFlagId - The id of the feature flag
   * @param value - The override value
   */
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

  /**
   * Delete user override for a feature flag
   *
   * @param userId - The id of the user
   * @param featureFlagId - The id of the feature flag
   */
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

// Export singleton instance
export const featureFlagsService = FeatureFlagsServiceSingleton.getInstance();
