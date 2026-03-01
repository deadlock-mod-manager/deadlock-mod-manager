import type { Cache } from "@deadlock-mods/common";
import type { NewSegment, Segment } from "@deadlock-mods/database";
import { err, ok, type Result } from "neverthrow";
import type { SegmentRepository } from "../repositories/segment";

export class SegmentService {
  constructor(
    private readonly segmentRepository: SegmentRepository,
    private readonly cache?: Cache,
  ) {}

  private async invalidateCache(): Promise<void> {
    if (this.cache) {
      try {
        await this.cache.clear();
      } catch {
        // Swallow - stale cache is preferable to failing the mutation
      }
    }
  }

  /**
   * Create a new segment
   *
   * @param segment - The segment to create
   * @returns The created segment
   */
  async createSegment(segment: NewSegment) {
    return this.segmentRepository.create(segment);
  }

  /**
   * Add a user to a segment
   *
   * @param segmentId - The id of the segment
   * @param userId - The id of the user
   * @returns The created segment member
   */
  async addUserToSegment(segmentId: string, userId: string) {
    const result = await this.segmentRepository.addUserToSegment(
      segmentId,
      userId,
    );
    if (result.isOk()) {
      await this.invalidateCache();
    }
    return result;
  }

  /**
   * Remove a user from a segment
   *
   * @param segmentId - The id of the segment
   * @param userId - The id of the user
   * @returns The deleted segment member
   */
  async removeUserFromSegment(segmentId: string, userId: string) {
    const result = await this.segmentRepository.removeUserFromSegment(
      segmentId,
      userId,
    );
    if (result.isOk()) {
      await this.invalidateCache();
    }
    return result;
  }

  /**
   * Create or update a segment feature flag override
   *
   * @param segmentId - The id of the segment
   * @param featureFlagId - The id of the feature flag
   * @param value - The override value
   * @returns The created or updated segment feature flag
   */
  async createSegmentFeatureFlagOverride(
    segmentId: string,
    featureFlagId: string,
    value: unknown,
  ) {
    const existingResult = await this.segmentRepository.findSegmentFeatureFlag(
      segmentId,
      featureFlagId,
    );

    if (existingResult.isErr()) {
      return existingResult;
    }

    const result = existingResult.value
      ? await this.segmentRepository.updateSegmentFeatureFlag(
          segmentId,
          featureFlagId,
          value,
        )
      : await this.segmentRepository.createSegmentFeatureFlag(
          segmentId,
          featureFlagId,
          value,
        );

    if (result.isOk()) {
      await this.invalidateCache();
    }
    return result;
  }

  /**
   * Get all segments for a user
   *
   * @param userId - The id of the user
   * @returns The user's segments
   */
  async getUserSegments(userId: string) {
    return this.segmentRepository.findByUserId(userId);
  }

  /**
   * Get the highest priority segment from a list of segments
   * Lower rank number = higher priority
   *
   * @param segments - The segments to evaluate
   * @returns The highest priority segment or null
   */
  getPrioritySegment(segments: Segment[]): Segment | null {
    if (segments.length === 0) {
      return null;
    }

    return segments.reduce((priority, current) => {
      return current.rank < priority.rank ? current : priority;
    });
  }

  /**
   * Get a segment override value for a specific feature flag
   *
   * @param segmentId - The id of the segment
   * @param featureFlagId - The id of the feature flag
   * @returns The override value or null if not found
   */
  async getSegmentOverride(
    segmentId: string,
    featureFlagId: string,
  ): Promise<Result<unknown | null, Error>> {
    const result = await this.segmentRepository.findSegmentFeatureFlag(
      segmentId,
      featureFlagId,
    );

    if (result.isErr()) {
      return err(result.error);
    }

    return ok(result.value?.value ?? null);
  }
}
