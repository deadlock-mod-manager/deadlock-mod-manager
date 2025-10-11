import type { NewFeatureFlag } from "@deadlock-mods/database";
import type { Logger } from "@deadlock-mods/logging";
import { Cacheable } from "@type-cacheable/core";
import { cacheClient } from "../cache";
import type { FeatureFlagRepository } from "../repositories/feature-flag";
import type { SegmentService } from "./segment";

export class FeatureFlagService {
  constructor(
    private readonly logger: Logger,
    private readonly featureFlagRepository: FeatureFlagRepository,
    private readonly segmentService?: SegmentService,
  ) {}

  /**
   * Create a new feature flag
   *
   * @param featureFlag - The feature flag to create
   * @returns The created feature flag
   */
  async createFeatureFlag(featureFlag: NewFeatureFlag) {
    return this.featureFlagRepository.create(featureFlag);
  }

  /**
   * Update a feature flag
   *
   * @param featureFlagId - The id of the feature flag to update
   * @param featureFlag - The feature flag to update
   * @returns The updated feature flag
   */
  async updateFeatureFlag(
    featureFlagId: string,
    featureFlag: Partial<NewFeatureFlag>,
  ) {
    return this.featureFlagRepository.update(featureFlagId, featureFlag);
  }

  /**
   * Delete a feature flag
   *
   * @param featureFlagId - The id of the feature flag to delete
   * @returns The deleted feature flag
   */
  async deleteFeatureFlag(featureFlagId: string) {
    return this.featureFlagRepository.delete(featureFlagId);
  }

  /**
   * Get all feature flags, the result is cached for 15 minutes
   */
  @Cacheable({
    cacheKey: () => "all-feature-flags",
    ttlSeconds: 15 * 60, // 15 minutes
    client: cacheClient,
  })
  async getAllFeatureFlags() {
    return this.featureFlagRepository.findAll();
  }

  /**
   * Get a feature flag value with type support, the result is cached for 15 minutes
   */
  @Cacheable({
    cacheKey: (args) => {
      const featureFlagId = args[0];
      const options = args[1];
      const userId = options?.userId ?? "";
      return `${featureFlagId}-${userId}`;
    },
    ttlSeconds: 15 * 60, // 15 minutes
    client: cacheClient,
  })
  async getFeatureFlagValue<T = unknown>(
    featureFlagId: string,
    options?: {
      shouldThrow?: boolean;
      userId?: string;
    },
  ): Promise<T> {
    const { shouldThrow = false, userId } = options ?? {};
    const featureFlagResult =
      await this.featureFlagRepository.findById(featureFlagId);

    if (featureFlagResult.isErr()) {
      if (shouldThrow) {
        throw featureFlagResult.error;
      }

      this.logger
        .withError(featureFlagResult.error)
        .error("Failed to find feature flag, returning null");

      return null as T;
    }
    const featureFlag = featureFlagResult.value;

    if (userId && this.segmentService) {
      const override = await this.getFeatureFlagOverrides(
        featureFlagId,
        userId,
        shouldThrow,
      );
      if (override !== null) {
        return override as T;
      }
    }

    return featureFlag.value as T;
  }

  /**
   * Check if a feature flag is enabled (boolean convenience method)
   * The result is cached for 15 minutes
   */
  async isFeatureFlagEnabled(
    featureFlagId: string,
    options?: {
      shouldThrow?: boolean;
      userId?: string;
    },
  ): Promise<boolean> {
    const value = await this.getFeatureFlagValue<boolean>(
      featureFlagId,
      options,
    );
    return Boolean(value);
  }

  /**
   * Find a feature flag by name
   *
   * @param name - The name of the feature flag
   * @returns The feature flag or error
   */
  async findByName(name: string) {
    return this.featureFlagRepository.findByName(name);
  }

  /**
   * Check if a feature flag exists by name
   *
   * @param name - The name of the feature flag
   * @returns True if the feature flag exists
   */
  async exists(name: string): Promise<boolean> {
    const result = await this.findByName(name);
    return result.isOk();
  }

  /**
   * Get feature flag overrides for a user based on their segment membership
   *
   * @param featureFlagId - The id of the feature flag
   * @param userId - The id of the user
   * @param shouldThrow - Whether to throw errors
   * @returns The override value or null if no override exists
   */
  private async getFeatureFlagOverrides(
    featureFlagId: string,
    userId: string,
    shouldThrow: boolean,
  ): Promise<unknown | null> {
    if (!this.segmentService) {
      return null;
    }

    try {
      const segmentsResult = await this.segmentService.getUserSegments(userId);

      if (segmentsResult.isErr()) {
        if (shouldThrow) {
          throw segmentsResult.error;
        }
        this.logger
          .withError(segmentsResult.error)
          .warn("Failed to get user segments for feature flag override");
        return null;
      }

      const segments = segmentsResult.value;
      if (segments.length === 0) {
        return null;
      }

      const prioritySegment = this.segmentService.getPrioritySegment(segments);
      if (!prioritySegment) {
        return null;
      }

      const overrideResult = await this.segmentService.getSegmentOverride(
        prioritySegment.id,
        featureFlagId,
      );

      if (overrideResult.isErr()) {
        if (shouldThrow) {
          throw overrideResult.error;
        }
        this.logger
          .withError(overrideResult.error)
          .warn("Failed to get segment override");
        return null;
      }

      return overrideResult.value;
    } catch (error) {
      if (shouldThrow) {
        throw error;
      }
      this.logger
        .withError(error)
        .warn("Unexpected error getting feature flag overrides");
      return null;
    }
  }
}
