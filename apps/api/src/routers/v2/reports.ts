import { db, ModRepository, ReportRepository } from "@deadlock-mods/database";
import {
  REPORT_DISABLED_MOD_IDS,
  toReportDto,
  toReportWithModDto,
} from "@deadlock-mods/shared";
import { ORPCError } from "@orpc/server";
import { CACHE_TTL } from "@/lib/constants";
import { logger, wideEventContext } from "@/lib/logger";
import { cache } from "@/lib/redis";
import { publicProcedure } from "../../lib/orpc";
import {
  CreateReportInputSchema,
  CreateReportResponseSchema,
  GetRecentReportsInputSchema,
  GetReportCountsInputSchema,
  GetReportsByModInputSchema,
  ReportCountsResponseSchema,
  ReportResponseSchema,
  ReportWithModResponseSchema,
} from "../../validation/reports";

const reportRepository = new ReportRepository(db);
const modRepository = new ModRepository(db);

export const reportsRouter = {
  createReport: publicProcedure
    .route({ method: "POST", path: "/v2/reports" })
    .input(CreateReportInputSchema)
    .output(CreateReportResponseSchema)
    .handler(async ({ input }) => {
      const wide = wideEventContext.get();
      wide?.merge({
        router: "reports",
        modId: input.modId,
      });

      try {
        const mod = await modRepository.findById(input.modId);
        if (!mod) {
          wide?.set("outcomeReason", "mod_not_found");
          throw new ORPCError("NOT_FOUND", {
            message: "Mod not found",
          });
        }

        if (mod.isMap || REPORT_DISABLED_MOD_IDS.has(mod.remoteId)) {
          wide?.merge({
            remoteId: mod.remoteId,
            outcomeReason: mod.isMap
              ? "reports_disabled_for_maps"
              : "reports_disabled",
          });
          return {
            id: "",
            status: "error" as const,
            error: "Reports are disabled for this mod",
          };
        }

        if (input.reporterHardwareId) {
          const existingReport = await reportRepository.findByModIdAndReporter(
            input.modId,
            input.reporterHardwareId,
          );
          if (existingReport) {
            wide?.merge({
              existingReportId: existingReport.id,
              outcomeReason: "duplicate_report",
            });
            return {
              id: existingReport.id,
              status: "error" as const,
              error: "You have already reported this mod",
            };
          }
        }

        const report = await reportRepository.create({
          modId: input.modId,
          reporterHardwareId: input.reporterHardwareId,
        });

        wide?.merge({
          reportId: report.id,
          modName: mod.name,
        });

        return {
          id: report.id,
          status: "success" as const,
        };
      } catch (error) {
        if (error instanceof ORPCError) {
          throw error;
        }

        wide?.set("outcomeReason", "create_failed");
        wide?.emit("error", error);

        return {
          id: "",
          status: "error" as const,
          error: "Failed to submit report. Please try again.",
        };
      }
    }),

  getReportsByMod: publicProcedure
    .route({ method: "GET", path: "/v2/reports/mod/{modId}" })
    .input(GetReportsByModInputSchema)
    .output(ReportResponseSchema.array())
    .handler(async ({ input }) => {
      try {
        return await cache.wrap(
          `reports:mod:${input.modId}`,
          async () => {
            const reports = await reportRepository.findByModId(input.modId);
            return reports.map(toReportDto);
          },
          CACHE_TTL.REPORT_COUNTS,
        );
      } catch (error) {
        logger
          .withError(error)
          .withMetadata({ modId: input.modId })
          .error("Failed to fetch reports for mod");
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Failed to fetch reports",
        });
      }
    }),

  getReportCounts: publicProcedure
    .route({ method: "GET", path: "/v2/reports/mod/{modId}/counts" })
    .input(GetReportCountsInputSchema)
    .output(ReportCountsResponseSchema)
    .handler(async ({ input }) => {
      try {
        return await cache.wrap(
          `reports:counts:${input.modId}`,
          async () => {
            const total = await reportRepository.getReportCount(input.modId);
            return { total, verified: 0, unverified: 0, dismissed: 0 };
          },
          CACHE_TTL.REPORT_COUNTS,
        );
      } catch (error) {
        logger
          .withError(error)
          .withMetadata({ modId: input.modId })
          .error("Failed to fetch report counts for mod");
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Failed to fetch report counts",
        });
      }
    }),

  getRecentReports: publicProcedure
    .route({ method: "GET", path: "/v2/reports/recent" })
    .input(GetRecentReportsInputSchema)
    .output(ReportWithModResponseSchema.array())
    .handler(async ({ input }) => {
      try {
        return await cache.wrap(
          `reports:recent:${input.limit}`,
          async () => {
            const reports = await reportRepository.getRecentReports(
              input.limit,
            );
            return reports.map(toReportWithModDto);
          },
          CACHE_TTL.REPORT_COUNTS,
        );
      } catch (error) {
        logger
          .withError(error)
          .withMetadata({ limit: input.limit })
          .error("Failed to fetch recent reports");
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Failed to fetch recent reports",
        });
      }
    }),
};
