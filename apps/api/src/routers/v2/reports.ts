import { db, ModRepository, ReportRepository } from "@deadlock-mods/database";
import { toReportDto, toReportWithModDto } from "@deadlock-mods/shared";
import { ORPCError } from "@orpc/server";
import { logger } from "@/lib/logger";
import { publicProcedure } from "../../lib/orpc";
import { reportService } from "../../services/report";
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
      try {
        logger
          .withMetadata({
            modId: input.modId,
            type: input.type,
            reporterHardwareId: input.reporterHardwareId,
          })
          .info("Processing new report submission");

        // Check if mod exists
        const mod = await modRepository.findById(input.modId);
        if (!mod) {
          logger
            .withMetadata({ modId: input.modId })
            .warn("Report submitted for non-existent mod");
          throw new ORPCError("NOT_FOUND", {
            message: "Mod not found",
          });
        }

        // Check for duplicate reports from same reporter
        if (input.reporterHardwareId) {
          const existingReport = await reportRepository.findByModIdAndReporter(
            input.modId,
            input.reporterHardwareId,
          );
          if (existingReport) {
            logger
              .withMetadata({
                modId: input.modId,
                reporterHardwareId: input.reporterHardwareId,
                existingReportId: existingReport.id,
              })
              .warn("Duplicate report attempt from same reporter");
            return {
              id: existingReport.id,
              status: "error" as const,
              error: "You have already reported this mod",
            };
          }
        }

        // Create the report
        const report = await reportRepository.create({
          modId: input.modId,
          type: input.type,
          reason: input.reason,
          description: input.description,
          reporterHardwareId: input.reporterHardwareId,
          status: "unverified",
        });

        logger
          .withMetadata({
            reportId: report.id,
            modId: input.modId,
            modName: mod.name,
          })
          .info("Report created successfully");

        // Publish event for Discord integration
        await reportService.publishNewReportEvent(report, mod);

        return {
          id: report.id,
          status: "success" as const,
        };
      } catch (error) {
        if (error instanceof ORPCError) {
          throw error;
        }

        logger
          .withError(error)
          .withMetadata({ modId: input.modId })
          .error("Failed to create report");

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
        const reports = await reportRepository.findByModId(input.modId);
        return reports.map(toReportDto);
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
        const counts = await reportRepository.getReportCountsByType(
          input.modId,
        );
        return counts;
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
        const reports = await reportRepository.getRecentReports(input.limit);
        return reports.map(toReportWithModDto);
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
