import { type Context, Hono } from "hono";
import { HealthService } from "@/services/health";

const healthRouter = new Hono();

healthRouter.get("/health", async (c: Context) => {
  const service = HealthService.getInstance();
  const result = await service.check();
  return c.json(result, result.status === "ok" ? 200 : 503);
});

export default healthRouter;
