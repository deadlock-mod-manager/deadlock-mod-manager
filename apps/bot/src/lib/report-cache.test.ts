import { describe, expect, it } from "bun:test";
import type { Report } from "@deadlock-mods/database";
import { reportCacheKeys } from "./report-cache";

function report(overrides: Partial<Report>): Report {
  return {
    id: "report_test",
    modId: null,
    provider: "gamebanana",
    submissionType: "mod",
    submissionId: "688091",
    modName: "Mod",
    modAuthor: "Author",
    reporterHardwareId: null,
    discordMessageId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("report cache invalidation", () => {
  it("invalidates affected mods, sounds, legacy IDs, and every recent report page", () => {
    const keys = reportCacheKeys([
      report({ modId: "mod_legacy" }),
      report({ submissionType: "sound" }),
      report({ modId: "mod_legacy" }),
    ]);
    expect(keys).toContain("reports:mod:688091");
    expect(keys).toContain("reports:counts:688091");
    expect(keys).toContain("reports:mod:snd-688091");
    expect(keys).toContain("reports:counts:snd-688091");
    expect(keys).toContain("reports:mod:mod_legacy");
    expect(keys).toContain("reports:counts:mod_legacy");
    for (let limit = 1; limit <= 100; limit++) {
      expect(keys).toContain(`reports:recent:${limit}`);
    }
    expect(keys).toHaveLength(106);
    expect(keys).not.toContain("reports:counts:999");
  });
});
