import type { NewFeatureFlag } from "@deadlock-mods/database";
import type { Logger } from "@deadlock-mods/logging";
import { Cacheable } from "@type-cacheable/core";
import { cacheClient } from "../cache";
import type { FeatureFlagRepository } from "../repositories/feature-flag";

export class FeatureFlagService {
  constructor(
    private readonly logger: Logger,
    private readonly featureFlagRepository: FeatureFlagRepository,
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
   * Check if a feature flag is enabled, the result is cached for 15 minutes
   */
  @Cacheable({
    cacheKey: (args) => {
      const featureFlagId = args[0];
      return featureFlagId;
    },
    ttlSeconds: 15 * 60, // 15 minutes
    client: cacheClient,
  })
  async isFeatureFlagEnabled(
    featureFlagId: string,
    options?: {
      shouldThrow?: boolean;
    },
  ) {
    const { shouldThrow = false } = options ?? {};
    const featureFlagResult =
      await this.featureFlagRepository.findById(featureFlagId);

    if (featureFlagResult.isErr()) {
      if (shouldThrow) {
        throw featureFlagResult.error;
      }

      this.logger
        .withError(featureFlagResult.error)
        .error("Failed to find feature flag, returning false");

      return false;
    }
    const featureFlag = featureFlagResult.value;

    return featureFlag.value;
  }
}
