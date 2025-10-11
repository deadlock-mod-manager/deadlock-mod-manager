import type { NewSegment, Segment } from "@deadlock-mods/database";
import { err, ok, type Result } from "neverthrow";
import type { SegmentRepository } from "../repositories/segment";

export class SegmentService {
  constructor(private readonly segmentRepository: SegmentRepository) {}

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
    return this.segmentRepository.addUserToSegment(segmentId, userId);
  }

  /**
   * Remove a user from a segment
   *
   * @param segmentId - The id of the segment
   * @param userId - The id of the user
   * @returns The deleted segment member
   */
  async removeUserFromSegment(segmentId: string, userId: string) {
    return this.segmentRepository.removeUserFromSegment(segmentId, userId);
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

    if (existingResult.value) {
      return this.segmentRepository.updateSegmentFeatureFlag(
        segmentId,
        featureFlagId,
        value,
      );
    }

    return this.segmentRepository.createSegmentFeatureFlag(
      segmentId,
      featureFlagId,
      value,
    );
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
