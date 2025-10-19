import { Hono } from "hono";
import { MetricsService } from "@/services/metrics";

const metricsRouter = new Hono();

metricsRouter.get("/", async (c) => {
  const result = await MetricsService.instance.getMetrics();

  if (result.isErr()) {
    return c.json({ error: result.error.message }, 500);
  }

  return c.json(result.value);
});

export default metricsRouter;
