import { EntityNotFoundError, mapDrizzleError } from "@deadlock-mods/common";
import type { NewFeatureFlag } from "@deadlock-mods/database";
import { BaseRepository, eq, featureFlags } from "@deadlock-mods/database";
import { err, ok } from "neverthrow";

export class FeatureFlagRepository extends BaseRepository {
  async create(featureFlag: NewFeatureFlag) {
    try {
      const [result] = await this.db
        .insert(featureFlags)
        .values(featureFlag)
        .returning();

      return ok(result);
    } catch (error) {
      this.logger.withError(error).error("Failed to create feature flag");
      return err(mapDrizzleError(error));
    }
  }

  async update(featureFlagId: string, featureFlag: Partial<NewFeatureFlag>) {
    try {
      const [result] = await this.db
        .update(featureFlags)
        .set(featureFlag)
        .where(eq(featureFlags.id, featureFlagId))
        .returning();

      return ok(result);
    } catch (error) {
      this.logger.withError(error).error("Failed to update feature flag");
      return err(mapDrizzleError(error));
    }
  }

  async delete(featureFlagId: string) {
    try {
      const existingResult = await this.db.query.featureFlags.findFirst({
        where: eq(featureFlags.id, featureFlagId),
      });

      if (!existingResult) {
        return err(new EntityNotFoundError("Feature flag", featureFlagId));
      }

      const result = await this.db
        .delete(featureFlags)
        .where(eq(featureFlags.id, featureFlagId));

      return ok(result);
    } catch (error) {
      this.logger.withError(error).error("Failed to delete feature flag");
      return err(mapDrizzleError(error));
    }
  }

  async findById(featureFlagId: string) {
    try {
      const result = await this.db.query.featureFlags.findFirst({
        where: eq(featureFlags.id, featureFlagId),
      });

      if (!result) {
        return err(new EntityNotFoundError("Feature flag", featureFlagId));
      }

      return ok(result);
    } catch (error) {
      this.logger.withError(error).error("Failed to find feature flag by id");
      return err(mapDrizzleError(error));
    }
  }

  async findAll(options?: { limit?: number; offset?: number }) {
    try {
      const result = await this.db.query.featureFlags.findMany({
        limit: options?.limit,
        offset: options?.offset,
        orderBy: [featureFlags.name],
      });

      return ok(result);
    } catch (error) {
      this.logger.withError(error).error("Failed to find all feature flags");
      return err(mapDrizzleError(error));
    }
  }

  async findByName(name: string) {
    try {
      const result = await this.db.query.featureFlags.findFirst({
        where: eq(featureFlags.name, name),
      });

      if (!result) {
        return err(new EntityNotFoundError("Feature flag", `name:${name}`));
      }

      return ok(result);
    } catch (error) {
      this.logger.withError(error).error("Failed to find feature flag by name");
      return err(mapDrizzleError(error));
    }
  }
}
