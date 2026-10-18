import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { ExtractionError } from "@deadlock-mods/common";
import * as _7z from "7zip-min";
import { logger } from "@/lib/logger";
import type { ExtractionOptions, ExtractionResult } from "@/types/archive";
import { ArchiveExtractor } from "../archive";

export class SevenZipExtractor extends ArchiveExtractor {
  private static instance: SevenZipExtractor | null = null;

  private constructor() {
    super(logger);
  }

  static getInstance(): SevenZipExtractor {
    if (!SevenZipExtractor.instance) {
      SevenZipExtractor.instance = new SevenZipExtractor();
    }
    return SevenZipExtractor.instance;
  }

  getSupportedExtensions(): string[] {
    return [".7z", ".zip", ".tar", ".gz", ".bz2", ".xz"];
  }

  async extractAll(
    archivePath: string,
    options: ExtractionOptions,
  ): Promise<ExtractionResult> {
    const filters = options.fileExtensions?.map((ext) => `*${ext}`) ?? [];
    // -ssc- matches the filters case-insensitively, -r applies them in subfolders
    const args = [
      "x",
      "-y",
      "-ssc-",
      `-o${options.targetDir}`,
      ...(filters.length > 0 ? ["-r"] : []),
      archivePath,
      ...filters,
    ];

    try {
      await _7z.cmd(args);
    } catch (error) {
      throw new ExtractionError("7z extraction failed", error);
    }

    const result: ExtractionResult = {
      extractedFiles: [],
      errors: [],
      totalBytes: 0,
    };
    const entries = await readdir(options.targetDir, { recursive: true });
    for (const entry of entries) {
      const stats = await stat(join(options.targetDir, entry));
      if (stats.isFile()) {
        result.extractedFiles.push(entry);
        result.totalBytes += stats.size;
      }
    }
    return result;
  }
}

export const sevenZipExtractor = SevenZipExtractor.getInstance();
