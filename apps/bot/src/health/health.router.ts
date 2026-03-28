import { type Context, Hono } from "hono";
import { container } from "tsyringe";
import { HealthService } from "@/health/health.service";

const healthRouter = new Hono();

healthRouter.get("/health", async (c: Context) => {
  const service = container.resolve(HealthService);
  const result = await service.check();
  return c.json(result, 200);
});

export default healthRouter;
