import { describe, expect, it } from "bun:test";
import type { Report } from "@deadlock-mods/database";
import { reportCacheKeys, summarizeClearedReports } from "./report-cache";

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

describe("report clearing totals", () => {
  it("counts stale totals for mods without remaining reports", async () => {
    const result = await summarizeClearedReports(
      [],
      [{ id: "mod_old", slug: "667084" }],
      async (slug) => (slug === "667084" ? 29 : undefined),
    );
    expect(result.totalCount).toBe(29);
    expect(result.cacheKeys).toContain("reports:counts:667084");
    expect(result.cacheKeys).toContain("reports:mod:667084");
    expect(result.cacheKeys).toContain("reports:counts:mod_old");
  });

  it("does not add duplicate totals from rows, legacy aliases, and cached counts", async () => {
    const result = await summarizeClearedReports(
      [report({ modId: "mod_legacy" }), report({ modId: "mod_legacy" })],
      [{ id: "mod_legacy", slug: "688091" }],
      async () => 29,
    );
    expect(result.totalCount).toBe(29);
  });

  it("sums mods and sounds separately and includes uncached report rows", async () => {
    const cached = new Map([
      ["688091", 29],
      ["snd-688091", 4],
    ]);
    const result = await summarizeClearedReports(
      [
        report({}),
        report({ submissionType: "sound" }),
        report({ submissionId: "123" }),
        report({ submissionId: "123" }),
        report({ submissionId: "123" }),
      ],
      [],
      async (slug) => cached.get(slug),
    );
    expect(result.totalCount).toBe(36);
    expect(result.cacheKeys).toContain("reports:counts:snd-688091");
  });

  it("uses deleted report counts when cached totals are lower", async () => {
    const result = await summarizeClearedReports(
      [report({}), report({})],
      [],
      async () => 1,
    );
    expect(result.totalCount).toBe(2);
  });

  it("counts legacy rows with their catalog submission", async () => {
    const result = await summarizeClearedReports(
      [report({ submissionId: null, modId: "mod_legacy" }), report({})],
      [{ id: "mod_legacy", slug: "688091" }],
      async (slug) => (slug === "688091" ? 29 : undefined),
    );
    expect(result.totalCount).toBe(29);
  });

  it("returns zero for an empty target while invalidating its caches", async () => {
    const result = await summarizeClearedReports(
      [],
      [{ id: "688091", slug: "688091" }],
      async () => undefined,
    );
    expect(result.totalCount).toBe(0);
    expect(result.cacheKeys).toContain("reports:counts:688091");
    expect(result.cacheKeys).toContain("reports:recent:50");
  });
});
