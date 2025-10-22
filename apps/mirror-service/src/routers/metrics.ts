import { Hono } from "hono";
import { logger } from "@/lib/logger";
import { MetricsService } from "@/services/metrics";

const metricsRouter = new Hono();

metricsRouter.get("/", async (c) => {
  const result = await MetricsService.instance.getMetrics();

  if (result.isErr()) {
    logger.withError(result.error).error("Failed to retrieve metrics");
    return c.json({ error: "Internal server error" }, 500);
  }

  return c.json(result.value);
});

export default metricsRouter;
