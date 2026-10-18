import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ExtractionError } from "@deadlock-mods/common";
import * as yauzl from "yauzl";
import { matchesExtensions, toSafeTargetPath } from "@/lib/archive-paths";
import { logger } from "@/lib/logger";
import type { ExtractionOptions, ExtractionResult } from "@/types/archive";
import { ArchiveExtractor } from "../archive";

const openZip = (archivePath: string) =>
  new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(
      archivePath,
      { lazyEntries: true, autoClose: false },
      (error, zipfile) => {
        if (error || !zipfile) {
          reject(new ExtractionError("Failed to open ZIP file", error));
          return;
        }
        resolve(zipfile);
      },
    );
  });

const nextEntry = (zipfile: yauzl.ZipFile) =>
  new Promise<yauzl.Entry | null>((resolve, reject) => {
    const settle = () => {
      zipfile.off("entry", onEntry);
      zipfile.off("end", onEnd);
      zipfile.off("error", onError);
    };
    const onEntry = (entry: yauzl.Entry) => {
      settle();
      resolve(entry);
    };
    const onEnd = () => {
      settle();
      resolve(null);
    };
    const onError = (error: Error) => {
      settle();
      reject(new ExtractionError("Failed to read ZIP entries", error));
    };
    zipfile.on("entry", onEntry);
    zipfile.on("end", onEnd);
    zipfile.on("error", onError);
    zipfile.readEntry();
  });

const openReadStream = (zipfile: yauzl.ZipFile, entry: yauzl.Entry) =>
  new Promise<Readable>((resolve, reject) => {
    zipfile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new ExtractionError("Failed to open read stream"));
        return;
      }
      resolve(stream);
    });
  });

export class ZipExtractor extends ArchiveExtractor {
  private static instance: ZipExtractor | null = null;

  private constructor() {
    super(logger);
  }

  static getInstance(): ZipExtractor {
    if (!ZipExtractor.instance) {
      ZipExtractor.instance = new ZipExtractor();
    }
    return ZipExtractor.instance;
  }

  getSupportedExtensions(): string[] {
    return [".zip"];
  }

  async extractAll(
    archivePath: string,
    options: ExtractionOptions,
  ): Promise<ExtractionResult> {
    const result: ExtractionResult = {
      extractedFiles: [],
      errors: [],
      totalBytes: 0,
    };
    const zipfile = await openZip(archivePath);

    try {
      for (
        let entry = await nextEntry(zipfile);
        entry;
        entry = await nextEntry(zipfile)
      ) {
        if (
          entry.fileName.endsWith("/") ||
          !matchesExtensions(entry.fileName, options.fileExtensions)
        ) {
          continue;
        }

        try {
          const readStream = await openReadStream(zipfile, entry);
          const writeStream = await this.createSafeWriteStream(
            toSafeTargetPath(options.targetDir, entry.fileName),
          );
          await pipeline(readStream, writeStream);
          result.extractedFiles.push(entry.fileName);
          result.totalBytes += entry.uncompressedSize;
        } catch (error) {
          result.errors.push({
            file: entry.fileName,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      zipfile.close();
    }

    return result;
  }
}

export const zipExtractor = ZipExtractor.getInstance();
