import type { MiddlewareHandler } from "hono";
import { createWideEvent, logger, wideEventContext } from "@/lib/logger";
import type { AppEnv } from "@/types/hono";

const EXCLUDED_PATHS = new Set(["/", "/metrics"]);

export const requestLogger: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (EXCLUDED_PATHS.has(c.req.path)) {
    return next();
  }

  const wide = createWideEvent(logger, "http_request", {
    method: c.req.method,
    path: c.req.path,
    userAgent: c.req.header("user-agent"),
  });

  c.set("wideEvent", wide);

  await wideEventContext.run(wide, async () => {
    try {
      await next();
      wide.set("status_code", c.res.status);
      wide.emit("success");
    } catch (error) {
      wide.set("status_code", 500);
      wide.emit("error", error);
      throw error;
    }
  });
};
