import type { Report, ReportStatus, ReportType } from "@deadlock-mods/database";

export interface ReportDto {
  id: string;
  modId: string;
  type: ReportType;
  status: ReportStatus;
  reason: string;
  description?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  dismissedBy?: string;
  dismissedAt?: string;
  dismissalReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportWithModDto extends ReportDto {
  modName: string;
  modAuthor: string;
}

export interface ReportCountsDto {
  total: number;
  verified: number;
  unverified: number;
  dismissed: number;
}

export interface ModWithReportCountsDto {
  modId: string;
  modName: string;
  modAuthor: string;
  totalReports: number;
  verifiedReports: number;
  unverifiedReports: number;
}

export const toReportDto = (report: Report): ReportDto => ({
  id: report.id,
  modId: report.modId,
  type: report.type,
  status: report.status,
  reason: report.reason,
  description: report.description || undefined,
  verifiedBy: report.verifiedBy || undefined,
  verifiedAt: report.verifiedAt?.toISOString(),
  dismissedBy: report.dismissedBy || undefined,
  dismissedAt: report.dismissedAt?.toISOString(),
  dismissalReason: report.dismissalReason || undefined,
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
