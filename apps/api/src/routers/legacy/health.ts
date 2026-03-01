import { type Context, Hono } from "hono";
import { HealthService } from "@/services/health";

const healthRouter = new Hono();

healthRouter.get("/", async (c: Context) => {
  const service = HealthService.getInstance();
  const result = await service.check();
  return c.json(result, 200);
});

export default healthRouter;
