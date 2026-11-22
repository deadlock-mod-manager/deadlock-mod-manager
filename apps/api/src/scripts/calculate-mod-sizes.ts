#!/usr/bin/env bun

/**
 * Script to calculate total size of all mod downloads
 *
 * Usage:
 * pnpm --filter api calculate-mod-sizes
 */

import { db, ModDownloadRepository } from "@deadlock-mods/database";
import { logger } from "@/lib/logger";

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
};

const calculateModSizes = async () => {
  try {
    logger.info("Starting mod download size calculation");

    const modDownloadRepository = new ModDownloadRepository(db);
    const allDownloads = await modDownloadRepository.findAll();

    if (allDownloads.length === 0) {
      logger.warn("No mod downloads found in database");
      console.log("\nNo mod downloads found.");
      process.exit(0);
    }

    const totalBytes = allDownloads.reduce(
      (sum, download) => sum + download.size,
      0,
    );

    logger
      .withMetadata({
        totalDownloads: allDownloads.length,
        totalBytes,
        totalFormatted: formatBytes(totalBytes),
      })
      .info("Calculated mod download sizes");

    console.log("\n=== Mod Download Size Report ===");
    console.log(`Total mod downloads: ${allDownloads.length}`);
    console.log(`Total size (bytes): ${totalBytes.toLocaleString()}`);
    console.log(`Total size: ${formatBytes(totalBytes)}`);
    console.log("================================\n");

    process.exit(0);
  } catch (error) {
    logger.withError(error).error("Failed to calculate mod download sizes");
    console.error(error);
    process.exit(1);
  }
};

if (import.meta.main) {
  calculateModSizes();
}
