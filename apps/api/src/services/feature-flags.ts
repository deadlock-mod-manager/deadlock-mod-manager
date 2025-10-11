import { db } from "@deadlock-mods/database";
import {
  type FeatureFlagDefinition,
  FeatureFlagRegistry,
  FeatureFlagRepository,
  FeatureFlagService,
  SegmentRepository,
  SegmentService,
} from "@deadlock-mods/feature-flags";
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
   * @returns True if the feature flag is enabled
   */
  async isFeatureEnabled(
    featureFlagName: string,
    userId?: string,
  ): Promise<boolean> {
    try {
      return await this.featureFlagService.isFeatureFlagEnabled(
        featureFlagName,
        { shouldThrow: false, userId },
      );
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({ featureFlagName, userId })
        .warn("Failed to check feature flag, defaulting to false");
      return false;
    }
  }

  /**
   * Get all feature flags
   */
  async getAllFeatureFlags() {
    try {
      return await this.featureFlagService.getAllFeatureFlags();
    } catch (error) {
      logger.withError(error).warn("Failed to get all feature flags");
      throw error;
    }
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
   * @returns Number of successfully registered flags
   */
  async bootstrap(definitions: FeatureFlagDefinition[]): Promise<number> {
    return this.registry.bootstrap(definitions);
  }

  /**
   * Add a user to a segment
   *
   * @param segmentId - The ID of the segment
   * @param userId - The ID of the user
   */
  async addUserToSegment(segmentId: string, userId: string) {
    return this.segmentService.addUserToSegment(segmentId, userId);
  }

  /**
   * Remove a user from a segment
   *
   * @param segmentId - The ID of the segment
   * @param userId - The ID of the user
   */
  async removeUserFromSegment(segmentId: string, userId: string) {
    return this.segmentService.removeUserFromSegment(segmentId, userId);
  }

  /**
   * Create or update a segment feature flag override
   *
   * @param segmentId - The ID of the segment
   * @param featureFlagId - The ID of the feature flag
   * @param value - The override value
   */
  async setSegmentOverride(
    segmentId: string,
    featureFlagId: string,
    value: unknown,
  ) {
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
   * @returns The feature flag value
   */
  async getFeatureFlagValue<T = unknown>(
    featureFlagName: string,
    userId?: string,
  ): Promise<T> {
    try {
      return await this.featureFlagService.getFeatureFlagValue<T>(
        featureFlagName,
        { shouldThrow: false, userId },
      );
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({ featureFlagName, userId })
        .warn("Failed to get feature flag value, returning null");
      return null as T;
    }
  }
}

// Export singleton instance
export const featureFlagsService = FeatureFlagsServiceSingleton.getInstance();
