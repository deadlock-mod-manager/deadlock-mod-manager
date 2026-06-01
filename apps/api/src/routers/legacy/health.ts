import { type Context, Hono } from "hono";
import { logger } from "@/lib/logger";
import { HealthService } from "@/services/health";
import { version } from "@/version";

const healthRouter = new Hono();

healthRouter.get("/health/live", (c: Context) =>
  c.json({ status: "ok", version }, 200),
);

healthRouter.get("/health/ready", async (c: Context) => {
  const service = HealthService.getInstance();
  const result = await service.check();

  if (result.status !== "ok") {
    logger.withMetadata({ health: result }).warn("Readiness check degraded");
    return c.json(result, 503);
  }

  return c.json(result, 200);
});

healthRouter.get("/", async (c: Context) => {
  const service = HealthService.getInstance();
  const result = await service.check();
  return c.json(result, 200);
});

export default healthRouter;
