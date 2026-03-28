import { createApp } from "./app";
import { env } from "./env";
import { createServiceLogger, logger } from "./logger";
import { ingestDocs } from "./mastra/tools/docs";

try {
  const logger = createServiceLogger("server");

  const appResult = await createApp();
  if (appResult.isErr()) {
    logger.withError(appResult.error).error("Failed to create app");
    process.exit(1);
  }

  const { app } = appResult.value;
  const server = Bun.serve({
    fetch: app.fetch,
    port: env.PORT,
    error(error) {
      logger.withError(error).error("Server error");
      return new Response("Internal Server Error", { status: 500 });
    },
  });

  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    server.stop().then(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });

    setTimeout(() => {
      logger.warn("Graceful shutdown timed out, forcing exit");
      process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_MS);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  logger.info(`Mastra server running on ${server.url}`);

  const ingestLog = createServiceLogger("docs-ingest");
  ingestDocs()
    .then(() => ingestLog.info("Docs ingestion complete"))
    .catch((err) =>
      ingestLog
        .withError(err instanceof Error ? err : new Error(String(err)))
        .warn("Docs ingestion failed, searchDocsTool may return empty results"),
    );
} catch (error) {
  logger.withError(error).error("Failed to start server");
  process.exit(1);
}
