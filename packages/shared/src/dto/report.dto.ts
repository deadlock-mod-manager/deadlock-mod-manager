import type { Report } from "@deadlock-mods/database";

export interface ReportDto {
  id: string;
  modId: string;
  /** @deprecated Always "broken". Kept for backwards compatibility with old clients. */
  type: string;
  /** @deprecated Always "verified". Kept for backwards compatibility with old clients. */
  status: string;
  /** @deprecated Always "". Kept for backwards compatibility with old clients. */
  reason: string;
  /** @deprecated Always undefined. Kept for backwards compatibility with old clients. */
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportWithModDto extends ReportDto {
  modName: string;
  modAuthor: string;
}

export interface ReportCountsDto {
  total: number;
  /** @deprecated Always 0. Kept for backwards compatibility with old desktop clients. */
  verified: number;
  /** @deprecated Always 0. Kept for backwards compatibility with old desktop clients. */
  unverified: number;
  /** @deprecated Always 0. Kept for backwards compatibility with old desktop clients. */
  dismissed: number;
}

export const toReportDto = (report: Report): ReportDto => ({
  id: report.id,
  modId: report.modId,
  type: "broken",
  status: "verified",
  reason: "",
  createdAt: report.createdAt?.toISOString() || new Date().toISOString(),
  updatedAt: report.updatedAt?.toISOString() || new Date().toISOString(),
});

export const toReportWithModDto = (
  report: Report & { modName: string; modAuthor: string },
): ReportWithModDto => ({
  ...toReportDto(report),
  modName: report.modName,
  modAuthor: report.modAuthor,
});
