import { z } from "zod";
import { adminProcedure } from "../../lib/orpc";
import { StatsService } from "../../services/stats";
import { AnalyticsWithTotalsSchema } from "../../validation/www";

export const dashboardRouter = {
  getAnalytics: adminProcedure
    .route({ method: "GET", path: "/v2/dashboard/analytics" })
    .input(
      z
        .object({
          timeRange: z
            .enum(["1h", "1d", "7d", "30d", "90d", "all"])
            .optional()
            .default("90d"),
        })
        .optional(),
    )
    .output(AnalyticsWithTotalsSchema)
    .handler(async ({ input }) => {
      const service = StatsService.getInstance();
      const timeRange = input?.timeRange || "90d";

      let hours: number | null;
      if (timeRange === "all") {
        hours = null;
      } else if (timeRange === "1h") {
        hours = 1;
      } else if (timeRange === "1d") {
        hours = 24;
      } else if (timeRange === "7d") {
        hours = 24 * 7;
      } else if (timeRange === "30d") {
        hours = 24 * 30;
      } else {
        hours = 24 * 90;
      }

      return await service.getAnalytics(hours);
    }),
};
