import { db } from "@deadlock-mods/database";
import {
  FeatureFlagRepository,
  FeatureFlagService,
} from "@deadlock-mods/feature-flags";
import { logger as mainLogger } from "../lib/logger";

const logger = mainLogger.child().withContext({
  service: "feature-flags",
});

export class FeatureFlagsServiceSingleton {
  private static instance: FeatureFlagsServiceSingleton;
  private readonly featureFlagService: FeatureFlagService;

  constructor() {
    const featureFlagRepository = new FeatureFlagRepository(db, logger);
    this.featureFlagService = new FeatureFlagService(
      logger,
      featureFlagRepository,
    );
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
   */
  async isFeatureEnabled(featureFlagName: string): Promise<boolean> {
    try {
      return await this.featureFlagService.isFeatureFlagEnabled(
        featureFlagName,
        { shouldThrow: false },
      );
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({ featureFlagName })
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
}

// Export singleton instance
export const featureFlagsService = FeatureFlagsServiceSingleton.getInstance();
