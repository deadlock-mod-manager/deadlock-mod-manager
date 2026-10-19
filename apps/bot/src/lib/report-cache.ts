import type { Report } from "@deadlock-mods/database";

export function reportCacheKeys(deletedReports: Report[]): string[] {
  const keys = new Set<string>();
  for (const report of deletedReports) {
    if (report.submissionId) {
      const slug =
        report.submissionType === "sound"
          ? `snd-${report.submissionId}`
          : report.submissionId;
      keys.add(`reports:mod:${slug}`);
      keys.add(`reports:counts:${slug}`);
    }
    if (report.modId) {
      keys.add(`reports:mod:${report.modId}`);
      keys.add(`reports:counts:${report.modId}`);
    }
  }
  // The recent reports endpoint accepts limits from 1 through 100.
  for (let limit = 1; limit <= 100; limit++) {
    keys.add(`reports:recent:${limit}`);
  }
  return [...keys];
}
