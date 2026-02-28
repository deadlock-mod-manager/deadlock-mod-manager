import type { Cache } from "@deadlock-mods/common";
import { FEATURE_FLAG_CACHE_TTL } from "@deadlock-mods/common";
import type { NewFeatureFlag } from "@deadlock-mods/database";
import type { Logger } from "@deadlock-mods/logging";
import type { FeatureFlagRepository } from "../repositories/feature-flag";
import type { SegmentService } from "./segment";

export class FeatureFlagService {
  constructor(
    private readonly logger: Logger,
    private readonly featureFlagRepository: FeatureFlagRepository,
    private readonly cache: Cache,
    private readonly segmentService?: SegmentService,
  ) {}

  private async invalidateAllCache(): Promise<void> {
    try {
      await this.cache.clear();
    } catch (error) {
      this.logger
        .withError(error)
        .warn("Failed to invalidate feature flag cache");
    }
  }

  private async invalidateUserCache(
    userId: string,
    featureFlagName: string,
  ): Promise<void> {
    try {
      await this.cache.mdel([
        `feature-flag-value-${featureFlagName}-${userId}`,
        `all-feature-flags-${userId}`,
        `client-feature-flags-${userId}`,
      ]);
    } catch (error) {
      this.logger
        .withError(error)
        .warn("Failed to invalidate user feature flag cache");
    }
  }

  /**
   * Create a new feature flag
   *
   * @param featureFlag - The feature flag to create
   * @returns The created feature flag
   */
  async createFeatureFlag(featureFlag: NewFeatureFlag) {
    const result = await this.featureFlagRepository.create(featureFlag);
    if (result.isOk()) {
      await this.invalidateAllCache();
    }
    return result;
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
    const result = await this.featureFlagRepository.update(
      featureFlagId,
      featureFlag,
    );
    if (result.isOk()) {
      await this.invalidateAllCache();
    }
    return result;
  }

  /**
   * Delete a feature flag
   *
   * @param featureFlagId - The id of the feature flag to delete
   * @returns The deleted feature flag
   */
  async deleteFeatureFlag(featureFlagId: string) {
    const result = await this.featureFlagRepository.delete(featureFlagId);
    if (result.isOk()) {
      await this.invalidateAllCache();
    }
    return result;
  }

  /**
   * Get all feature flags, the result is cached for 15 minutes
   */
  async getAllFeatureFlags(options?: { userId?: string }) {
    const userId = options?.userId ?? "";
    const cacheKey = `all-feature-flags-${userId}`;

    return this.cache.wrap(
      cacheKey,
      () => this.featureFlagRepository.findAll(options),
      FEATURE_FLAG_CACHE_TTL,
    );
  }

  /**
   * Get all exposed feature flags, the result is cached for 15 minutes
   */
  async getAllExposedFeatureFlags() {
    return this.cache.wrap(
      "all-exposed-feature-flags",
      () => this.featureFlagRepository.findAllExposed(),
      FEATURE_FLAG_CACHE_TTL,
    );
  }

  /**
   * Get all feature flags formatted for client consumption with user-specific overrides applied
   * The result is cached for 15 minutes per user
   *
   * @param options - Options including userId for user-specific overrides
   * @returns Array of feature flags with applied overrides ready for client
   */
  async getClientFeatureFlags(options?: { userId?: string }) {
    const userId = options?.userId ?? "";
    const cacheKey = `client-feature-flags-${userId}`;

    return this.cache.wrap(
      cacheKey,
      async () => {
        const allFlagsResult = await this.getAllFeatureFlags(options);

        if (allFlagsResult.isErr()) {
          throw allFlagsResult.error;
        }

        const flags = allFlagsResult.value;

        return flags.map((flag) => {
          let value = flag.value;

          if (
            userId &&
            "userOverrides" in flag &&
            flag.userOverrides &&
            Array.isArray(flag.userOverrides) &&
            flag.userOverrides.length > 0
          ) {
            value = flag.userOverrides[0].value;
          }

          return {
            id: flag.id,
            name: flag.name,
            description: flag.description,
            type: flag.type,
            value,
            enabled: value,
            exposed: flag.exposed,
          };
        });
      },
      FEATURE_FLAG_CACHE_TTL,
    );
  }

  /**
   * Get a feature flag value with type support, the result is cached for 15 minutes
   *
   * @param featureFlagName - The name of the feature flag
   * @param options - Options including shouldThrow and userId for segment overrides
   * @returns The feature flag value
   */
  async getFeatureFlagValue<T = unknown>(
    featureFlagName: string,
    options?: {
      shouldThrow?: boolean;
      userId?: string;
    },
  ): Promise<T> {
    const { shouldThrow = false, userId } = options ?? {};
    const cacheKey = `feature-flag-value-${featureFlagName}-${userId ?? ""}`;

    return this.cache.wrap(
      cacheKey,
      async () => {
        const featureFlagResult =
          await this.featureFlagRepository.findByName(featureFlagName);

        if (featureFlagResult.isErr()) {
          if (shouldThrow) {
            throw featureFlagResult.error;
          }

          this.logger
            .withError(featureFlagResult.error)
            .error("Failed to find feature flag by name, returning null");

          return null as T;
        }
        const featureFlag = featureFlagResult.value;

        if (userId) {
          const userOverride = await this.getUserFeatureFlagOverride(
            userId,
            featureFlag.id,
            shouldThrow,
          );
          if (userOverride !== null) {
            return userOverride as T;
          }

          if (this.segmentService) {
            const segmentOverride = await this.getFeatureFlagOverrides(
              featureFlag.id,
              userId,
              shouldThrow,
            );
            if (segmentOverride !== null) {
              return segmentOverride as T;
            }
          }
        }

        return featureFlag.value as T;
      },
      FEATURE_FLAG_CACHE_TTL,
    );
  }

  /**
   * Check if a feature flag is enabled (boolean convenience method)
   * The result is cached for 15 minutes
   *
   * @param featureFlagName - The name of the feature flag
   * @param options - Options including shouldThrow and userId for segment overrides
   * @returns True if the feature flag is enabled
   */
  async isFeatureFlagEnabled(
    featureFlagName: string,
    options?: {
      shouldThrow?: boolean;
      userId?: string;
    },
  ): Promise<boolean> {
    const value = await this.getFeatureFlagValue<boolean>(
      featureFlagName,
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
   * Set user override for a feature flag
   *
   * @param userId - The id of the user
   * @param featureFlagId - The id of the feature flag
   * @param value - The override value
   * @returns The created/updated override
   */
  async setUserOverride(userId: string, featureFlagId: string, value: unknown) {
    const result = await this.featureFlagRepository.setUserOverride(
      userId,
      featureFlagId,
      value,
    );
    if (result.isOk()) {
      const flagResult =
        await this.featureFlagRepository.findById(featureFlagId);
      if (flagResult.isOk()) {
        await this.invalidateUserCache(userId, flagResult.value.name);
      } else {
        await this.invalidateAllCache();
      }
    }
    return result;
  }

  /**
   * Delete user override for a feature flag
   *
   * @param userId - The id of the user
   * @param featureFlagId - The id of the feature flag
   * @returns The deletion result
   */
  async deleteUserOverride(userId: string, featureFlagId: string) {
    const result = await this.featureFlagRepository.deleteUserOverride(
      userId,
      featureFlagId,
    );
    if (result.isOk()) {
      const flagResult =
        await this.featureFlagRepository.findById(featureFlagId);
      if (flagResult.isOk()) {
        await this.invalidateUserCache(userId, flagResult.value.name);
      } else {
        await this.invalidateAllCache();
      }
    }
    return result;
  }

  /**
   * Get user feature flag override
   *
   * @param userId - The id of the user
   * @param featureFlagId - The id of the feature flag
   * @param shouldThrow - Whether to throw errors
   * @returns The override value or null if no override exists
   */
  private async getUserFeatureFlagOverride(
    userId: string,
    featureFlagId: string,
    shouldThrow: boolean,
  ): Promise<unknown | null> {
    try {
      const overrideResult = await this.featureFlagRepository.getUserOverride(
        userId,
        featureFlagId,
      );

      if (overrideResult.isErr()) {
        return null;
      }

      return overrideResult.value.value;
    } catch (error) {
      if (shouldThrow) {
        throw error;
      }
      this.logger
        .withError(error)
        .warn("Unexpected error getting user feature flag override");
      return null;
    }
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
