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
  attempt: AnalyticsAttempt<"mod_download">;
  quietCancels: number;
  /** Cancellations the backend makes on its own that report nothing. */
  expectedCancels: number;
  /** A completion held back while a cancellation is expected. */
  heldCompletion?: string;
  /** False while the download waits in the backend's queue. */
  started: boolean;
}
interface DownloadQueueDependencies {
  start: (
    properties: AnalyticsOperations["mod_download"]["start"],
  ) => AnalyticsAttempt<"mod_download">;
  queue: (mod: DownloadableMod) => Promise<void>;
  cancel: (modId: string) => Promise<void>;
  duplicateMessage: () => string;
  onQueueError: (error: Error) => void;
}

// Backend events identify only the mod: one record owns its callbacks and attempt.
export class DownloadQueue {
  private pending = new Map<string, PendingDownload>();
  constructor(private readonly dependencies: DownloadQueueDependencies) {}

  getMod(modId: string) {
    return this.pending.get(modId)?.mod;
  }
  start(modId: string) {
    const entry = this.pending.get(modId);
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
      quietCancels: 0,
      expectedCancels: 0,
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
    this.dependencies.queue(mod).catch((error) => {
      if (!this.settle(mod.remoteId, "failed", entry)) return;
      const failure =
        error instanceof Error ? error : new Error(getErrorMessage(error));
      this.dependencies.onQueueError(failure);
      mod.onError(failure);
    });
  }

  complete(modId: string, path: string) {
    const entry = this.pending.get(modId);
    const mod = this.settle(modId, "completed");
    if (mod && entry && entry.expectedCancels > 0) {
      entry.heldCompletion = path;
      return;
    }
    mod?.onComplete(path);
  }

  fail(modId: string, error: string) {
    const cancelled = error === "Download cancelled";
    const entry = this.pending.get(modId);
    const mod = this.settle(modId, cancelled ? "cancelled" : "failed");
    if (cancelled && entry && entry.expectedCancels > 0) return;
    mod?.onError(new Error(error));
  }

  /**
   * The backend may cancel these downloads itself: a cancellation it reports
   * stays quiet, a failure still notifies, and a completion waits. Call the
   * returned function once the backend is done. If its operation went
   * through, these downloads are over and report nothing more; otherwise a
   * completion that waited reports now. Only downloads for `profileFolder`
   * count; another profile's download of the same mod carries on.
   */
  expectCancellations(modIds: readonly string[], profileFolder: string | null) {
    const entries = modIds.flatMap((modId) => {
      const entry = this.pending.get(modId);
      return entry && (entry.mod.profileFolder ?? null) === profileFolder
        ? [entry]
        : [];
    });
    for (const entry of entries) entry.expectedCancels++;
    return (applied: boolean) => {
      for (const entry of entries) {
        entry.expectedCancels--;
        const path = entry.heldCompletion;
        if (applied) {
          entry.heldCompletion = undefined;
          this.settle(entry.mod.remoteId, "cancelled", entry);
        } else if (entry.expectedCancels === 0 && path !== undefined) {
          entry.heldCompletion = undefined;
          entry.mod.onComplete(path);
        }
      }
    };
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

  private settle(
    modId: string,
    outcome: AnalyticsOutcome,
    expected = this.pending.get(modId),
  ) {
    if (!expected || this.pending.get(modId) !== expected) return;
    this.pending.delete(modId);
    expected.attempt.finish(outcome);
    return expected.quietCancels > 0 ? undefined : expected.mod;
  }
}
