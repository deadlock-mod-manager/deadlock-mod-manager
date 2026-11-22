const RATE_WINDOW_MS = 60 * 60 * 1000;
const TIMING_SAMPLES = 50;

type JobOutcome = "indexed" | "skipped" | "permanent" | "failed";

interface JobTimings {
  downloadMs: number;
  slotWaitMs: number;
  indexMs: number;
}

interface IndexedJob {
  timings: JobTimings;
  bytes: number;
  vpks: number;
  duplicates: number;
  unreadable: number;
}

const average = (values: number[]) =>
  values.length === 0
    ? 0
    : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

/** In-process counters since start, read by the metrics endpoint */
class IngestionStats {
  readonly startedAt = Date.now();
  readonly inFlight = { downloading: 0, waitingForSlot: 0, processing: 0 };
  private readonly jobs = {
    indexed: 0,
    skipped: 0,
    permanent: 0,
    failed: 0,
  } satisfies Record<JobOutcome, number>;
  private readonly vpks = { indexed: 0, duplicates: 0, unreadable: 0 };
  private bytesDownloaded = 0;
  private finishedAt: number[] = [];
  private timings: JobTimings[] = [];
  private lastBackfill: { at: string; scheduled: number } | null = null;

  recordIndexed(job: IndexedJob): void {
    this.jobs.indexed++;
    this.bytesDownloaded += job.bytes;
    this.vpks.indexed += job.vpks - job.duplicates - job.unreadable;
    this.vpks.duplicates += job.duplicates;
    this.vpks.unreadable += job.unreadable;
    this.timings = [...this.timings.slice(1 - TIMING_SAMPLES), job.timings];
    this.markFinished();
  }

  record(outcome: Exclude<JobOutcome, "indexed">): void {
    this.jobs[outcome]++;
    if (outcome === "permanent") this.markFinished();
  }

  recordBackfill(scheduled: number): void {
    this.lastBackfill = { at: new Date().toISOString(), scheduled };
  }

  /** Files settled (indexed or given up on) per hour over the last hour */
  filesPerHour(): number {
    this.pruneFinished();
    const windowMs = Math.min(RATE_WINDOW_MS, Date.now() - this.startedAt);
    return windowMs <= 0
      ? 0
      : Math.round((this.finishedAt.length * RATE_WINDOW_MS) / windowMs);
  }

  snapshot() {
    return {
      jobs: { ...this.jobs },
      vpks: { ...this.vpks },
      inFlight: { ...this.inFlight },
      downloadedMb: Math.round(this.bytesDownloaded / 1024 / 1024),
      filesPerHour: this.filesPerHour(),
      avgRecentMs: {
        download: average(this.timings.map((t) => t.downloadMs)),
        slotWait: average(this.timings.map((t) => t.slotWaitMs)),
        index: average(this.timings.map((t) => t.indexMs)),
      },
      lastBackfill: this.lastBackfill,
    };
  }

  private markFinished(): void {
    this.finishedAt.push(Date.now());
    this.pruneFinished();
  }

  private pruneFinished(): void {
    const cutoff = Date.now() - RATE_WINDOW_MS;
    this.finishedAt = this.finishedAt.filter((at) => at >= cutoff);
  }
}

export const ingestionStats = new IngestionStats();
