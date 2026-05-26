import type { Logger } from "@deadlock-mods/logging";
import { Hono } from "hono";
import type { HealthResponse } from "@/types/health";

export const createHealthRouter = ({
  check,
  logger,
}: {
  check: () => Promise<HealthResponse>;
  logger: Logger;
}) => {
  const router = new Hono();

  router.get("/health", (c) => c.json({ status: "ok" }, 200));

  router.get("/health/ready", async (c) => {
    const result = await check();

    if (result.status !== "ok") {
      logger.withMetadata({ health: result }).warn("Readiness check degraded");
      return c.json(result, 503);
    }

    return c.json(result, 200);
  });

  return router;
};
