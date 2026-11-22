#!/usr/bin/env bun

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
