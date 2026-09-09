import type { Context } from "hono";
import { Hono } from "hono";
import { HealthService } from "@/services/health";

const healthRouter = new Hono();

healthRouter.get("/", async (c: Context) => {
  const service = HealthService.getInstance();
  const result = await service.check();
  const statusCode = result.status === "ok" ? 200 : 503;
  return c.json(result, statusCode);
});

healthRouter.get("/health", async (c: Context) => {
  const service = HealthService.getInstance();
  const result = await service.check();
  const statusCode = result.status === "ok" ? 200 : 503;
  return c.json(result, statusCode);
});

export default healthRouter;
