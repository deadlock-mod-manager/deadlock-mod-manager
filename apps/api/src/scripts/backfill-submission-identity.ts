#!/usr/bin/env bun

/**
 * Re-runs the migration 0055 backfill: copies the GameBanana submission
 * identity onto reports and VPKs that only reference the legacy catalog.
 * Run once after the v2 rollout completes, to cover rows the previous API or
 * Lockdex wrote while both versions were live. Idempotent.
 *
 * Legacy desktop compatibility: remove with the catalog retirement (#715).
 *
 * Usage:
 * pnpm --filter api backfill-submission-identity
 */

import { db, ReportRepository, VpkRepository } from "@deadlock-mods/database";
import { createWideEvent, logger, wideEventContext } from "@/lib/logger";

const backfillSubmissionIdentity = async () => {
  const wide = createWideEvent(logger, "backfill_submission_identity", {
    trigger: "cli",
  });

  return wideEventContext.run(wide, async () => {
    try {
      const reports = await new ReportRepository(db).backfillLegacyIdentities();
      const vpks = await new VpkRepository(db).backfillLegacyIdentities();
      wide.merge({ reports, vpks });
      wide.emit("success");
      process.exit(0);
    } catch (error) {
      wide.emit("error", error);
      process.exit(1);
    }
  });
};

if (import.meta.main) {
  backfillSubmissionIdentity();
}
