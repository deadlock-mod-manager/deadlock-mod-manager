import {
  db,
  PolicyRuleRepository,
  ReportRepository,
} from "@deadlock-mods/database";
import {
  REPORT_DISABLED_MOD_IDS,
  toReportDto,
  toReportWithModDto,
} from "@deadlock-mods/shared";
import { ORPCError } from "@orpc/server";
import { CACHE_TTL } from "@/lib/constants";
import { logger, wideEventContext } from "@/lib/logger";
import { cache } from "@/lib/redis";
import {
  fetchGameBananaSubmissionSnapshot,
  parseGameBananaSlug,
} from "@/services/gamebanana-submission";
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
const policyRepository = new PolicyRuleRepository(db);

const requireIdentity = (slug: string) => {
  const identity = parseGameBananaSlug(slug);
  if (!identity) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Invalid GameBanana submission ID",
    });
  }
  return identity;
};

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
        const identity = requireIdentity(input.modId);
        const submission = await fetchGameBananaSubmissionSnapshot(identity);
        if (!submission) {
          wide?.set("outcomeReason", "mod_not_found");
          throw new ORPCError("NOT_FOUND", {
            message: "Mod not found",
          });
        }

        const blockingRules = await Promise.all(
          (
            ["hidden", "blacklisted", "takedown", "emergency_disable"] as const
          ).map((kind) => policyRepository.find(identity, kind)),
        );
        if (
          submission.isMap ||
          REPORT_DISABLED_MOD_IDS.has(submission.slug) ||
          blockingRules.some(Boolean)
        ) {
          wide?.merge({
            remoteId: submission.slug,
            outcomeReason: submission.isMap
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
          const existingReport =
            await reportRepository.findByIdentityAndReporter(
              identity,
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
          ...identity,
          modName: submission.name,
          modAuthor: submission.author,
          reporterHardwareId: input.reporterHardwareId,
        });

        wide?.merge({
          reportId: report.id,
          modName: submission.name,
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
        const identity = requireIdentity(input.modId);
        return await cache.wrap(
          `reports:mod:${input.modId}`,
          async () => {
            const reports = await reportRepository.findByIdentity(identity);
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
        const identity = requireIdentity(input.modId);
        return await cache.wrap(
          `reports:counts:${input.modId}`,
          async () => {
            const total = await reportRepository.getReportCount(identity);
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
