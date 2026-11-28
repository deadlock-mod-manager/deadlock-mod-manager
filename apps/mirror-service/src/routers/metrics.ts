import { Hono } from "hono";

const metricsRouter = new Hono().get("/", (c) =>
  c.json({
    cacheHitRate: 0,
    totalStorageUsed: 0,
    totalFiles: 0,
    bandwidthSaved: 0,
    topDownloads: [],
    timestamp: new Date().toISOString(),
  }),
);

export default metricsRouter;
