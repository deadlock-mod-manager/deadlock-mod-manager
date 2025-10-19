import { Hono } from "hono";
import { version } from "../version";

const healthRouter = new Hono();

healthRouter.get("/", (c) => {
  return c.json({
    status: "ok",
    service: "mirror-service",
    version,
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get("/health", (c) => {
  return c.json({
    status: "healthy",
    service: "mirror-service",
    version,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

export default healthRouter;
