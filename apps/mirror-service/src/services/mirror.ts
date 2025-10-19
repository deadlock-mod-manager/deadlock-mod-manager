import { RuntimeError } from "@deadlock-mods/common";
import {
  db,
  MirroredFileRepository,
  ModDownloadRepository,
} from "@deadlock-mods/database";
import type { Logger } from "@deadlock-mods/logging";
import { err, ok } from "neverthrow";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { MetricsService } from "./metrics";
import { S3Service } from "./s3";

export class MirrorService {
  static #instance: MirrorService | null = null;
  private readonly logger: Logger;
  private readonly modDownloadRepository: ModDownloadRepository;
  private readonly mirroredFileRepository: MirroredFileRepository;
  private constructor() {
    this.logger = logger.child().withContext({
      service: "DownloadService",
    });
    this.modDownloadRepository = new ModDownloadRepository(db);
    this.mirroredFileRepository = new MirroredFileRepository(db, this.logger);
  }

  static get instance(): MirrorService {
    if (!MirrorService.#instance) {
      MirrorService.#instance = new MirrorService();
    }
    return MirrorService.#instance;
  }

  async mirrorFile(modId: string, fileId: string) {
    const mirroredFile = await this.mirroredFileRepository.findByModIdAndFileId(
      modId,
      fileId,
    );

    if (mirroredFile.isOk()) {
      // Update last downloaded at
      await this.mirroredFileRepository.update(mirroredFile.value.id, {
        lastDownloadedAt: new Date(),
      });

      // Track cache hit
      await MetricsService.instance.incrementCacheHit();
      await MetricsService.instance.incrementDownload(mirroredFile.value.id);

      // Stream file directly from S3
      const stream = await S3Service.instance.downloadFileStream(
        mirroredFile.value.s3Key,
      );
      if (stream.isErr()) {
        this.logger
          .withMetadata({ modId, fileId })
          .withError(stream.error)
          .error("Failed to download file");
        return err(stream.error);
      }

      return ok({
        outputStream: stream.value,
        size: mirroredFile.value.fileSize,
        file: mirroredFile.value.filename,
      });
    }

    // Track cache miss
    await MetricsService.instance.incrementCacheMiss();

    const result = await this.modDownloadRepository.findByModIdAndFileId(
      modId,
      fileId,
    );

    if (result.isErr()) {
      this.logger
        .withMetadata({ modId, fileId })
        .withError(result.error)
        .error("Failed to download file");
      return err(result.error);
    }

    const file = await fetch(result.value.url);
    const key = `mods/${result.value.remoteId}/${result.value.file}`;

    if (!file.body) {
      this.logger
        .withMetadata({ modId, fileId })
        .error("Failed to get body stream");
      return err(new RuntimeError("Failed to get body stream"));
    }

    const onFileUploaded = async (hash: string) => {
      logger
        .withMetadata({ modId, fileId, key, hash })
        .info("File mirrored to S3");

      const mirroredFile = await this.mirroredFileRepository.create({
        modId,
        modDownloadId: fileId,
        remoteId: result.value.remoteId,
        filename: result.value.file,
        s3Key: key,
        s3Bucket: env.S3_BUCKET,
        fileHash: hash,
        fileSize: result.value.size,
        mirroredAt: new Date(),
        lastDownloadedAt: new Date(),
        lastValidated: new Date(),
        isStale: false,
      });

      if (mirroredFile.isErr()) {
        this.logger
          .withMetadata({ modId, fileId })
          .withError(mirroredFile.error)
          .error("Failed to create mirrored file");
        return;
      }

      // Track download for newly mirrored file
      await MetricsService.instance.incrementDownload(mirroredFile.value.id);
    };

    const { outputStream, uploadPromise } =
      S3Service.instance.uploadAndStreamThrough(key, file.body, onFileUploaded);

    void uploadPromise.catch((error) => {
      this.logger
        .withMetadata({
          modId,
          fileId,
          key,
          size: result.value.size,
          uploadedAt: new Date(),
        })
        .withError(error)
        .error("Failed to upload file");
    });

    return ok({
      outputStream,
      size: result.value.size,
      file: result.value.file,
    });
  }
}
