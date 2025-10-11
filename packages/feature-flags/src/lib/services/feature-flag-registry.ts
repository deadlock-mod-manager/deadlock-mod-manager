import type { FeatureFlagType } from "@deadlock-mods/database";
import type { Logger } from "@deadlock-mods/logging";
import { err, ok } from "neverthrow";
import type { FeatureFlagService } from "./feature-flag";

export interface FeatureFlagDefinition {
  name: string;
  description?: string;
  type?: FeatureFlagType;
  defaultValue?: unknown;
}

export class FeatureFlagRegistry {
  constructor(
    private readonly featureFlagService: FeatureFlagService,
    private readonly logger: Logger,
  ) {}

  /**
   * Register a feature flag, creating it if it doesn't exist
   *
   * @param definition - The feature flag definition
   * @returns The feature flag (existing or newly created)
   */
  async register(definition: FeatureFlagDefinition) {
    const {
      name,
      description,
      type = "boolean",
      defaultValue = false,
    } = definition;

    try {
      const existingResult = await this.featureFlagService.findByName(name);

      if (existingResult.isOk()) {
        this.logger
          .withMetadata({ name })
          .info("Feature flag already exists, skipping creation");
        return ok(existingResult.value);
      }

      this.logger
        .withMetadata({ name, type, defaultValue })
        .info("Creating feature flag");

      const createResult = await this.featureFlagService.createFeatureFlag({
        name,
        description,
        type,
        value: defaultValue,
      });

      if (createResult.isErr()) {
        this.logger
          .withError(createResult.error)
          .withMetadata({ name })
          .error("Failed to create feature flag");
        return err(createResult.error);
      }

      this.logger
        .withMetadata({ name, id: createResult.value.id })
        .info("Successfully created feature flag");

      return ok(createResult.value);
    } catch (error) {
      this.logger
        .withError(error)
        .withMetadata({ name })
        .error("Unexpected error registering feature flag");
      return err(error as Error);
    }
  }

  /**
   * Register multiple feature flags
   *
   * @param definitions - Array of feature flag definitions
   * @returns Array of results for each registration
   */
  async registerMany(definitions: FeatureFlagDefinition[]) {
    this.logger
      .withMetadata({ count: definitions.length })
      .info("Registering multiple feature flags");

    const results = await Promise.all(
      definitions.map((definition) => this.register(definition)),
    );

    const successCount = results.filter((r) => r.isOk()).length;
    const failureCount = results.filter((r) => r.isErr()).length;

    this.logger
      .withMetadata({ successCount, failureCount, total: definitions.length })
      .info("Completed feature flag registration");

    return results;
  }

  /**
   * Bootstrap feature flags by registering all provided definitions
   * This method logs errors but doesn't throw, making it safe for app startup
   *
   * @param definitions - Array of feature flag definitions
   * @returns Number of successfully registered flags
   */
  async bootstrap(definitions: FeatureFlagDefinition[]): Promise<number> {
    if (definitions.length === 0) {
      this.logger.info("No feature flags to bootstrap");
      return 0;
    }

    this.logger
      .withMetadata({ count: definitions.length })
      .info("Starting feature flag bootstrap");

    try {
      const results = await this.registerMany(definitions);
      const successCount = results.filter((r) => r.isOk()).length;

      this.logger
        .withMetadata({ successCount, total: definitions.length })
        .info("Feature flag bootstrap completed");

      return successCount;
    } catch (error) {
      this.logger.withError(error).error("Feature flag bootstrap failed");
      return 0;
    }
  }
}
