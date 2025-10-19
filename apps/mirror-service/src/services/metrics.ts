import {
  db,
  type MirroredFile,
  MirroredFileRepository,
} from "@deadlock-mods/database";
import type { Logger } from "@deadlock-mods/logging";
import { err, ok, type Result } from "neverthrow";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

interface MetricsData {
  cacheHitRate: number;
  totalStorageUsed: number;
  totalFiles: number;
  bandwidthSaved: number;
  topDownloads: Array<{
    fileId: string;
    filename: string;
    downloads: number;
  }>;
  timestamp: string;
}

export class MetricsService {
  static #instance: MetricsService | null = null;
  private readonly logger: Logger;
  private readonly mirroredFileRepository: MirroredFileRepository;

  private readonly CACHE_HIT_KEY = "mirror:metrics:cache_hits";
  private readonly CACHE_MISS_KEY = "mirror:metrics:cache_misses";
  private readonly DOWNLOAD_KEY_PREFIX = "mirror:metrics:downloads:";

  private constructor() {
    this.logger = logger.child().withContext({
      service: "MetricsService",
    });
    this.mirroredFileRepository = new MirroredFileRepository(db, this.logger);
  }

  static get instance(): MetricsService {
    if (!MetricsService.#instance) {
      MetricsService.#instance = new MetricsService();
    }
    return MetricsService.#instance;
  }

  async incrementCacheHit(): Promise<void> {
    try {
      await redis.incr(this.CACHE_HIT_KEY);
    } catch (error) {
      this.logger.withError(error).error("Failed to increment cache hit");
    }
  }

  async incrementCacheMiss(): Promise<void> {
    try {
      await redis.incr(this.CACHE_MISS_KEY);
    } catch (error) {
      this.logger.withError(error).error("Failed to increment cache miss");
    }
  }

  async incrementDownload(fileId: string): Promise<void> {
    try {
      await redis.incr(`${this.DOWNLOAD_KEY_PREFIX}${fileId}`);
    } catch (error) {
      this.logger
        .withMetadata({ fileId })
        .withError(error)
        .error("Failed to increment download count");
    }
  }

  async getCacheHitRate(): Promise<number> {
    try {
      const hits = await redis.get(this.CACHE_HIT_KEY);
      const misses = await redis.get(this.CACHE_MISS_KEY);

      const hitsNum = Number.parseInt(hits ?? "0", 10);
      const missesNum = Number.parseInt(misses ?? "0", 10);
      const total = hitsNum + missesNum;

      if (total === 0) {
        return 0;
      }

      return (hitsNum / total) * 100;
    } catch (error) {
      this.logger.withError(error).error("Failed to get cache hit rate");
      return 0;
    }
  }

  async getTopDownloads(
    limit = 10,
  ): Promise<Array<{ fileId: string; filename: string; downloads: number }>> {
    try {
      const files = await this.mirroredFileRepository.findAll();
      if (files.isErr()) {
        this.logger.withError(files.error).error("Failed to get all files");
        return [];
      }

      const fileDownloads = await Promise.all(
        files.value.map(async (file: MirroredFile) => {
          const downloads = await redis.get(
            `${this.DOWNLOAD_KEY_PREFIX}${file.id}`,
          );
          return {
            fileId: file.id,
            filename: file.filename,
            downloads: Number.parseInt(downloads ?? "0", 10),
          };
        }),
      );

      return fileDownloads
        .sort((a, b) => b.downloads - a.downloads)
        .slice(0, limit);
    } catch (error) {
      this.logger.withError(error).error("Failed to get top downloads");
      return [];
    }
  }

  async calculateBandwidthSaved(): Promise<number> {
    try {
      const hits = await redis.get(this.CACHE_HIT_KEY);
      const hitsNum = Number.parseInt(hits ?? "0", 10);

      const storageResult = await this.mirroredFileRepository.getTotalStorage();
      if (storageResult.isErr()) {
        this.logger
          .withError(storageResult.error)
          .error("Failed to get total storage");
        return 0;
      }

      const { totalSize, count } = storageResult.value;

      if (count === 0) {
        return 0;
      }

      const averageFileSize = totalSize / count;
      return Math.round(hitsNum * averageFileSize);
    } catch (error) {
      this.logger.withError(error).error("Failed to calculate bandwidth saved");
      return 0;
    }
  }

  async getMetrics(): Promise<Result<MetricsData, Error>> {
    try {
      const storageResult = await this.mirroredFileRepository.getTotalStorage();
      if (storageResult.isErr()) {
        return err(storageResult.error);
      }

      const { totalSize, count } = storageResult.value;
      const cacheHitRate = await this.getCacheHitRate();
      const bandwidthSaved = await this.calculateBandwidthSaved();
      const topDownloads = await this.getTopDownloads(10);

      return ok({
        cacheHitRate: Math.round(cacheHitRate * 100) / 100,
        totalStorageUsed: totalSize,
        totalFiles: count,
        bandwidthSaved,
        topDownloads,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.withError(error).error("Failed to get metrics");
      return err(error as Error);
    }
  }
}
