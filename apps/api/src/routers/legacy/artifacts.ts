import { join } from "node:path";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { logger } from "../../lib/logger";

const artifactsRouter = new Hono();

artifactsRouter.use(
  "/*",
  serveStatic({
    root: join(import.meta.dir, "../../static"),
    onNotFound(path) {
      logger.warn(`File not found: ${path}`);
    },
  }),
);

export default artifactsRouter;
