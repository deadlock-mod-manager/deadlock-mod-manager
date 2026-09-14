import type { Report } from "@deadlock-mods/database";
import { describe, expect, it } from "vitest";
import { toReportDto, toReportWithModDto } from "./report.dto";

const legacyReport: Report = {
  id: "report_legacy",
  modId: "mod_legacy",
  provider: null,
  submissionType: null,
  submissionId: null,
  modName: "Legacy mod",
  modAuthor: "Legacy author",
  reporterHardwareId: null,
  discordMessageId: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

describe("report DTOs during database expansion", () => {
  it("uses the legacy mod ID before the identity backfill", () => {
    expect(toReportWithModDto(legacyReport)).toMatchObject({
      id: "report_legacy",
      modId: "mod_legacy",
      modName: "Legacy mod",
      modAuthor: "Legacy author",
    });
  });

  it("preserves sound and mod slugs for reports with submission identities", () => {
    expect(
      toReportDto({
        ...legacyReport,
        provider: "gamebanana",
        submissionType: "sound",
        submissionId: "123",
      }).modId,
    ).toBe("snd-123");
    expect(
      toReportDto({
        ...legacyReport,
        provider: "gamebanana",
        submissionType: "mod",
        submissionId: "123",
      }).modId,
    ).toBe("123");
  });
});
