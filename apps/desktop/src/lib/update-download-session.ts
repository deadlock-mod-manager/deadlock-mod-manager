export type UpdateDownloadInfoEvent =
  | {
      kind: "started";
      artifactSizeBytes: number | null;
    }
  | {
      kind: "completed";
      artifactSizeBytes: number | null;
      downloadedBytes: number;
      elapsedMs: number;
    };

export type UpdateDownloadFailureEvent = {
  kind: "failed";
  artifactSizeBytes: number | null;
  downloadedBytes: number;
  elapsedMs: number;
  errorMessage: string;
};

type UpdateDownloadSessionOptions = {
  now: () => number;
  scheduleFrame: (callback: () => void) => number;
  cancelFrame: (handle: number) => void;
  onProgress: (percentage: number) => void;
  onInfo: (event: UpdateDownloadInfoEvent) => void;
  onFailure: (event: UpdateDownloadFailureEvent) => void;
};

export class UpdateDownloadSession {
  private artifactSizeBytes: number | null = null;
  private downloadedBytes = 0;
  private startedAt = 0;
  private pendingPercentage: number | null = null;
  private publishedPercentage = 0;
  private frameHandle: number | null = null;
  private terminal = false;

  constructor(private readonly options: UpdateDownloadSessionOptions) {}

  begin() {
    this.cancelPendingFrame();
    this.artifactSizeBytes = null;
    this.downloadedBytes = 0;
    this.startedAt = this.options.now();
    this.pendingPercentage = null;
    this.terminal = false;
    this.publishProgress(0);
  }

  started(contentLength?: number) {
    this.artifactSizeBytes = contentLength ?? null;
    this.options.onInfo({
      kind: "started",
      artifactSizeBytes: this.artifactSizeBytes,
    });
  }

  progressed(chunkLength: number) {
    this.downloadedBytes += Math.max(0, chunkLength);
    if (!this.artifactSizeBytes || this.artifactSizeBytes <= 0) return;

    this.pendingPercentage = Math.min(
      100,
      Math.round((this.downloadedBytes / this.artifactSizeBytes) * 100),
    );
    if (this.frameHandle !== null) return;

    this.frameHandle = this.options.scheduleFrame(() => {
      this.frameHandle = null;
      if (this.pendingPercentage === null) return;
      this.publishProgress(this.pendingPercentage);
      this.pendingPercentage = null;
    });
  }

  completed() {
    if (this.terminal) return;
    this.terminal = true;
    this.cancelPendingFrame();
    this.publishProgress(100);
    this.options.onInfo({
      kind: "completed",
      artifactSizeBytes: this.artifactSizeBytes,
      downloadedBytes: this.downloadedBytes,
      elapsedMs: this.elapsedMs(),
    });
  }

  failed(errorMessage: string): boolean {
    if (this.terminal) return false;
    this.terminal = true;
    this.cancelPendingFrame();
    this.options.onFailure({
      kind: "failed",
      artifactSizeBytes: this.artifactSizeBytes,
      downloadedBytes: this.downloadedBytes,
      elapsedMs: this.elapsedMs(),
      errorMessage,
    });
    return true;
  }

  dispose() {
    this.cancelPendingFrame();
  }

  private elapsedMs(): number {
    return Math.max(0, Math.round(this.options.now() - this.startedAt));
  }

  private publishProgress(percentage: number) {
    if (percentage === this.publishedPercentage && percentage !== 0) return;
    this.publishedPercentage = percentage;
    this.options.onProgress(percentage);
  }

  private cancelPendingFrame() {
    if (this.frameHandle !== null) {
      this.options.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
    this.pendingPercentage = null;
  }
}
