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
      } catch {}
    }
  }

  async createSegment(segment: NewSegment) {
    return this.segmentRepository.create(segment);
  }

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

  async getUserSegments(userId: string) {
    return this.segmentRepository.findByUserId(userId);
  }

  getPrioritySegment(segments: Segment[]): Segment | null {
    if (segments.length === 0) {
      return null;
    }

    return segments.reduce((priority, current) => {
      return current.rank < priority.rank ? current : priority;
    });
  }

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
