#!/usr/bin/env bun

/**
 * Script to purge all unverified reports from the database.
 *
 * Usage:
 * pnpm --filter api purge-unverified-reports
 */

import { db, ReportRepository } from "@deadlock-mods/database";
import { logger } from "@/lib/logger";

const purgeUnverifiedReports = async () => {
  try {
    logger.info("Purging unverified reports");

    const reportRepository = new ReportRepository(db);
    const deletedCount = await reportRepository.deleteAllUnverified();

    logger.withMetadata({ deletedCount }).info("Purged unverified reports");

    console.log(`Purged ${deletedCount} unverified report(s).`);
    process.exit(0);
  } catch (error) {
    logger.withError(error).error("Failed to purge unverified reports");
    console.error(error);
    process.exit(1);
  }
};

if (import.meta.main) {
  purgeUnverifiedReports();
}
