import { EntityNotFoundError, mapDrizzleError } from "@deadlock-mods/common";
import type {
  NewFeatureFlag,
  NewUserFeatureFlagOverride,
} from "@deadlock-mods/database";
import {
  and,
  BaseRepository,
  eq,
  featureFlags,
  userFeatureFlagOverrides,
} from "@deadlock-mods/database";
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

  async findAll(options?: {
    limit?: number;
    offset?: number;
    userId?: string;
  }) {
    try {
      const result = await this.db.query.featureFlags.findMany({
        limit: options?.limit,
        offset: options?.offset,
        orderBy: [featureFlags.name],
        with: options?.userId
          ? {
              userOverrides: {
                where: eq(userFeatureFlagOverrides.userId, options.userId),
              },
            }
          : undefined,
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

  async findAllExposed(options?: { limit?: number; offset?: number }) {
    try {
      const result = await this.db.query.featureFlags.findMany({
        where: eq(featureFlags.exposed, true),
        limit: options?.limit,
        offset: options?.offset,
        orderBy: [featureFlags.name],
      });

      return ok(result);
    } catch (error) {
      this.logger
        .withError(error)
        .error("Failed to find all exposed feature flags");
      return err(mapDrizzleError(error));
    }
  }

  async getUserOverride(userId: string, featureFlagId: string) {
    try {
      const result = await this.db.query.userFeatureFlagOverrides.findFirst({
        where: and(
          eq(userFeatureFlagOverrides.userId, userId),
          eq(userFeatureFlagOverrides.featureFlagId, featureFlagId),
        ),
      });

      if (!result) {
        return err(
          new EntityNotFoundError(
            "User feature flag override",
            `userId:${userId},featureFlagId:${featureFlagId}`,
          ),
        );
      }

      return ok(result);
    } catch (error) {
      this.logger
        .withError(error)
        .error("Failed to find user feature flag override");
      return err(mapDrizzleError(error));
    }
  }

  async setUserOverride(userId: string, featureFlagId: string, value: unknown) {
    try {
      const [result] = await this.db
        .insert(userFeatureFlagOverrides)
        .values({
          userId,
          featureFlagId,
          value,
        } as NewUserFeatureFlagOverride)
        .onConflictDoUpdate({
          target: [
            userFeatureFlagOverrides.userId,
            userFeatureFlagOverrides.featureFlagId,
          ],
          set: {
            value,
            updatedAt: new Date(),
          },
        })
        .returning();

      return ok(result);
    } catch (error) {
      this.logger
        .withError(error)
        .error("Failed to set user feature flag override");
      return err(mapDrizzleError(error));
    }
  }

  async deleteUserOverride(userId: string, featureFlagId: string) {
    try {
      const existingResult = await this.getUserOverride(userId, featureFlagId);

      if (existingResult.isErr()) {
        return existingResult;
      }

      const result = await this.db
        .delete(userFeatureFlagOverrides)
        .where(
          and(
            eq(userFeatureFlagOverrides.userId, userId),
            eq(userFeatureFlagOverrides.featureFlagId, featureFlagId),
          ),
        );

      return ok(result);
    } catch (error) {
      this.logger
        .withError(error)
        .error("Failed to delete user feature flag override");
      return err(mapDrizzleError(error));
    }
  }
}
