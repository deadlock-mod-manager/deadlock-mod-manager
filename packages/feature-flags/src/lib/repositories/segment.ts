import { EntityNotFoundError, mapDrizzleError } from "@deadlock-mods/common";
import {
  and,
  asc,
  BaseRepository,
  eq,
  type NewSegment,
  segmentFeatureFlags,
  segmentMembers,
  segments,
} from "@deadlock-mods/database";
import { err, ok } from "neverthrow";

export class SegmentRepository extends BaseRepository {
  async create(segment: NewSegment) {
    try {
      const [result] = await this.db
        .insert(segments)
        .values(segment)
        .returning();

      return ok(result);
    } catch (error) {
      this.logger.withError(error).error("Failed to create segment");
      return err(mapDrizzleError(error));
    }
  }

  async findById(segmentId: string) {
    try {
      const result = await this.db.query.segments.findFirst({
        where: eq(segments.id, segmentId),
      });

      if (!result) {
        return err(new EntityNotFoundError("Segment", segmentId));
      }

      return ok(result);
    } catch (error) {
      this.logger.withError(error).error("Failed to find segment by id");
      return err(mapDrizzleError(error));
    }
  }

  async findByUserId(userId: string) {
    try {
      const result = await this.db
        .select({
          id: segments.id,
          name: segments.name,
          description: segments.description,
          rank: segments.rank,
          createdAt: segments.createdAt,
          updatedAt: segments.updatedAt,
        })
        .from(segments)
        .innerJoin(segmentMembers, eq(segments.id, segmentMembers.segmentId))
        .where(eq(segmentMembers.userId, userId))
        .orderBy(asc(segments.rank));

      return ok(result);
    } catch (error) {
      this.logger.withError(error).error("Failed to find segments by user id");
      return err(mapDrizzleError(error));
    }
  }

  async addUserToSegment(segmentId: string, userId: string) {
    try {
      const segmentResult = await this.findById(segmentId);
      if (segmentResult.isErr()) {
        return err(segmentResult.error);
      }

      const [result] = await this.db
        .insert(segmentMembers)
        .values({ segmentId, userId })
        .returning();

      return ok(result);
    } catch (error) {
      this.logger.withError(error).error("Failed to add user to segment");
      return err(mapDrizzleError(error));
    }
  }

  async removeUserFromSegment(segmentId: string, userId: string) {
    try {
      const result = await this.db
        .delete(segmentMembers)
        .where(
          and(
            eq(segmentMembers.segmentId, segmentId),
            eq(segmentMembers.userId, userId),
          ),
        )
        .returning();

      if (result.length === 0) {
        return err(
          new EntityNotFoundError(
            "Segment membership",
            `${segmentId}-${userId}`,
          ),
        );
      }

      return ok(result[0]);
    } catch (error) {
      this.logger.withError(error).error("Failed to remove user from segment");
      return err(mapDrizzleError(error));
    }
  }

  async createSegmentFeatureFlag(
    segmentId: string,
    featureFlagId: string,
    value: unknown,
  ) {
    try {
      const [result] = await this.db
        .insert(segmentFeatureFlags)
        .values({ segmentId, featureFlagId, value })
        .returning();

      return ok(result);
    } catch (error) {
      this.logger
        .withError(error)
        .error("Failed to create segment feature flag");
      return err(mapDrizzleError(error));
    }
  }

  async updateSegmentFeatureFlag(
    segmentId: string,
    featureFlagId: string,
    value: unknown,
  ) {
    try {
      const [result] = await this.db
        .update(segmentFeatureFlags)
        .set({ value })
        .where(
          and(
            eq(segmentFeatureFlags.segmentId, segmentId),
            eq(segmentFeatureFlags.featureFlagId, featureFlagId),
          ),
        )
        .returning();

      if (!result) {
        return err(
          new EntityNotFoundError(
            "Segment feature flag",
            `${segmentId}-${featureFlagId}`,
          ),
        );
      }

      return ok(result);
    } catch (error) {
      this.logger
        .withError(error)
        .error("Failed to update segment feature flag");
      return err(mapDrizzleError(error));
    }
  }

  async deleteSegmentFeatureFlag(segmentId: string, featureFlagId: string) {
    try {
      const result = await this.db
        .delete(segmentFeatureFlags)
        .where(
          and(
            eq(segmentFeatureFlags.segmentId, segmentId),
            eq(segmentFeatureFlags.featureFlagId, featureFlagId),
          ),
        )
        .returning();

      if (result.length === 0) {
        return err(
          new EntityNotFoundError(
            "Segment feature flag",
            `${segmentId}-${featureFlagId}`,
          ),
        );
      }

      return ok(result[0]);
    } catch (error) {
      this.logger
        .withError(error)
        .error("Failed to delete segment feature flag");
      return err(mapDrizzleError(error));
    }
  }

  async findSegmentFeatureFlag(segmentId: string, featureFlagId: string) {
    try {
      const result = await this.db.query.segmentFeatureFlags.findFirst({
        where: and(
          eq(segmentFeatureFlags.segmentId, segmentId),
          eq(segmentFeatureFlags.featureFlagId, featureFlagId),
        ),
      });

      return ok(result ?? null);
    } catch (error) {
      this.logger.withError(error).error("Failed to find segment feature flag");
      return err(mapDrizzleError(error));
    }
  }

  async findAllSegmentFeatureFlags(segmentId: string) {
    try {
      const result = await this.db.query.segmentFeatureFlags.findMany({
        where: eq(segmentFeatureFlags.segmentId, segmentId),
      });

      return ok(result);
    } catch (error) {
      this.logger
        .withError(error)
        .error("Failed to find all segment feature flags");
      return err(mapDrizzleError(error));
    }
  }
}
