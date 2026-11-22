import { getErrorMessage } from "@/lib/errors";
import {
  modContentType,
  type AnalyticsAttempt,
  type AnalyticsOperations,
  type AnalyticsOutcome,
} from "@/lib/analytics/schema";
import type { DownloadableMod } from "@/types/mods";

/**
 * The rejection a second request for an in-flight mod gets. The first download
 * is still running and owns the mod's status, so a caller must not mark the mod
 * failed over it.
 */
export class DownloadAlreadyQueuedError extends Error {}

interface PendingDownload {
  mod: DownloadableMod;
  /** Names this request in the backend's events. */
  attemptId: string;
  attempt: AnalyticsAttempt<"mod_download">;
  quietCancels: number;
  /** False while the download waits in the backend's queue. */
  started: boolean;
}
interface DownloadQueueDependencies {
  start: (
    properties: AnalyticsOperations["mod_download"]["start"],
  ) => AnalyticsAttempt<"mod_download">;
  queue: (mod: DownloadableMod, attemptId: string) => Promise<void>;
  cancel: (modId: string) => Promise<void>;
  duplicateMessage: () => string;
  onQueueError: (error: Error) => void;
  /** Unique across reloads: a reloaded window must not reuse an earlier attempt's id. */
  createAttemptId: () => string;
}

// One record per mod owns its callbacks and attempt. Backend events that settle
// a download also name the attempt, and only that attempt's record takes them.
export class DownloadQueue {
  private pending = new Map<string, PendingDownload>();
  constructor(private readonly dependencies: DownloadQueueDependencies) {}

  getMod(modId: string) {
    return this.pending.get(modId)?.mod;
  }
  /** The mod's pending download, if it is the attempt the event names. */
  getAttempt(modId: string, attemptId: string | null) {
    return this.attempt(modId, attemptId)?.mod;
  }
  start(modId: string, attemptId: string | null) {
    const entry = this.attempt(modId, attemptId);
    if (entry) entry.started = true;
    return entry?.mod;
  }
  /**
   * A resumed download goes back to the backend's queue, where it may wait
   * behind the download that started while it was paused.
   */
  requeue(modId: string) {
    const entry = this.pending.get(modId);
    if (entry) entry.started = false;
  }
  isStarted(modId: string) {
    return this.pending.get(modId)?.started === true;
  }
  clear() {
    this.pending.clear();
  }

  add(mod: DownloadableMod) {
    if (this.pending.has(mod.remoteId)) {
      mod.onError(
        new DownloadAlreadyQueuedError(this.dependencies.duplicateMessage()),
      );
      return;
    }
    const entry: PendingDownload = {
      mod,
      attemptId: this.dependencies.createAttemptId(),
      quietCancels: 0,
      attempt: this.dependencies.start({
        mod_id: mod.remoteId,
        entry_point: mod.analyticsEntryPoint ?? "other",
        operation_kind: mod.analyticsOperationKind ?? "download",
        file_count: mod.downloads?.length ?? 0,
        content_type: modContentType(mod),
      }),
      started: false,
    };
    this.pending.set(mod.remoteId, entry);
    this.dependencies.queue(mod, entry.attemptId).catch((error) => {
      if (!this.settle(mod.remoteId, "failed", entry)) return;
      const failure =
        error instanceof Error ? error : new Error(getErrorMessage(error));
      this.dependencies.onQueueError(failure);
      mod.onError(failure);
    });
  }

  complete(modId: string, attemptId: string | null, path: string) {
    const entry = this.attempt(modId, attemptId);
    if (!entry) return;
    this.settle(modId, "completed", entry)?.onComplete(path);
  }

  fail(modId: string, attemptId: string | null, error: string) {
    const entry = this.attempt(modId, attemptId);
    if (!entry) return;
    this.settle(
      modId,
      error === "Download cancelled" ? "cancelled" : "failed",
      entry,
    )?.onError(new Error(error));
  }

  /** Quiet cancels skip completion/error callbacks. Returns false if untracked. */
  async cancel(modId: string, notify = true) {
    const entry = this.pending.get(modId);
    if (entry && !notify) entry.quietCancels++;
    try {
      await this.dependencies.cancel(modId);
    } catch (error) {
      if (entry && !notify) entry.quietCancels--;
      throw error;
    }
    if (!entry) return false;
    // Completion may enqueue another request while the cancellation IPC is pending.
    this.settle(modId, "cancelled", entry)?.onError(
      new Error("Download cancelled"),
    );
    return true;
  }

  private attempt(modId: string, attemptId: string | null) {
    const entry = this.pending.get(modId);
    return entry?.attemptId === attemptId ? entry : undefined;
  }

  private settle(
    modId: string,
    outcome: AnalyticsOutcome,
    expected: PendingDownload,
  ) {
    if (this.pending.get(modId) !== expected) return;
    this.pending.delete(modId);
    expected.attempt.finish(outcome);
    return expected.quietCancels > 0 ? undefined : expected.mod;
  }
}
