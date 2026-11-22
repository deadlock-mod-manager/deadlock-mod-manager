import { db, VpkRepository } from "@deadlock-mods/database";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ingestionStats } from "@/lib/metrics";
import { MAX_FILE_SIZE } from "@/processors/mod-file-processor";
import { archiveExtractorFactory } from "@/services/archive";
import { modFileProcessingQueue } from "@/services/queue";
import { version } from "@/version";

// The coverage count scans every download, so it is cached between requests
const COVERAGE_TTL_MS = 60 * 1000;
const toMb = (bytes: number) => Math.round(bytes / 1024 / 1024);

/** JSON progress report for `kubectl port-forward`, not a public endpoint */
class MetricsServer {
  private readonly vpkRepository = new VpkRepository(db);
  private server: ReturnType<typeof Bun.serve> | null = null;
  private coverage: {
    value: { indexable: number; ingested: number };
    fetchedAt: number;
  } | null = null;

  start(): void {
    this.server = Bun.serve({
      port: env.LOCKDEX_METRICS_PORT,
      fetch: async (request) => {
        if (new URL(request.url).pathname !== "/metrics") {
          return new Response("Not found", { status: 404 });
        }
        try {
          return Response.json(await this.snapshot());
        } catch (error) {
          logger.withError(error).error("Failed to build metrics");
          return Response.json(
            { error: "metrics unavailable" },
            { status: 500 },
          );
        }
      },
    });
    logger.info(`Metrics listening on :${env.LOCKDEX_METRICS_PORT}/metrics`);
  }

  async stop(): Promise<void> {
    await this.server?.stop();
  }

  private async snapshot() {
    const [queue, coverage] = await Promise.all([
      modFileProcessingQueue.getQueue().getJobCounts(),
      this.getCoverage(),
    ]);
    const stats = ingestionStats.snapshot();
    const pending = coverage.indexable - coverage.ingested;
    const memory = process.memoryUsage();

    return {
      version,
      uptimeSeconds: Math.round((Date.now() - ingestionStats.startedAt) / 1000),
      concurrency: {
        downloads: env.LOCKDEX_DOWNLOAD_CONCURRENCY,
        processing: env.LOCKDEX_PROCESSING_CONCURRENCY,
      },
      memoryMb: { rss: toMb(memory.rss), heapUsed: toMb(memory.heapUsed) },
      queue,
      coverage: {
        ...coverage,
        pending,
        percent:
          coverage.indexable === 0
            ? 100
            : Math.round((coverage.ingested / coverage.indexable) * 1000) / 10,
        etaHours:
          stats.filesPerHour === 0
            ? null
            : Math.round((pending / stats.filesPerHour) * 10) / 10,
      },
      sinceStart: stats,
    };
  }

  private async getCoverage() {
    if (
      this.coverage &&
      Date.now() - this.coverage.fetchedAt < COVERAGE_TTL_MS
    ) {
      return this.coverage.value;
    }
    const value = await this.vpkRepository.countIngestionCoverage({
      maxSizeBytes: MAX_FILE_SIZE,
      extensions: archiveExtractorFactory
        .getSupportedExtensions()
        .map((ext) => ext.slice(1)),
    });
    this.coverage = { value, fetchedAt: Date.now() };
    return value;
  }
}

export const metricsServer = new MetricsServer();
