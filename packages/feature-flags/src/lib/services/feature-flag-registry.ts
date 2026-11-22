import { EntityNotFoundError, UnknownError } from "@deadlock-mods/common";
import type { FeatureFlagType } from "@deadlock-mods/database";
import type { Logger } from "@deadlock-mods/logging";
import { err, ok } from "neverthrow";
import type { FeatureFlagService } from "./feature-flag";

export interface FeatureFlagDefinition {
  name: string;
  description?: string;
  type?: FeatureFlagType;
  defaultValue?: unknown;
  exposed?: boolean;
}

export class FeatureFlagRegistry {
  constructor(
    private readonly featureFlagService: FeatureFlagService,
    private readonly logger: Logger,
  ) {}

  async register(definition: FeatureFlagDefinition) {
    const {
      name,
      description,
      type = "boolean",
      defaultValue = false,
      exposed = false,
    } = definition;

    try {
      const existingResult = await this.featureFlagService.findByName(name);

      if (existingResult.isOk()) {
        return ok(existingResult.value);
      }

      if (!(existingResult.error instanceof EntityNotFoundError)) {
        return err(existingResult.error);
      }

      this.logger
        .withMetadata({ name, type, defaultValue, exposed })
        .info("Creating feature flag");

      const createResult = await this.featureFlagService.createFeatureFlag({
        name,
        description,
        type,
        value: defaultValue,
        exposed,
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
      return err(error instanceof Error ? error : new UnknownError(error));
    }
  }

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
