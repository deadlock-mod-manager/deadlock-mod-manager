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
  /** Set while a cancel that must not call back is waiting for the backend. */
  silent?: boolean;
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
      attempt: this.dependencies.start({
        mod_id: mod.remoteId,
        entry_point: mod.analyticsEntryPoint ?? "other",
        operation_kind: mod.analyticsOperationKind ?? "download",
        file_count: mod.downloads?.length ?? 0,
        content_type: modContentType(mod),
      }),
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
    this.settle(modId, "completed")?.onComplete(path);
  }

  fail(modId: string, error: string) {
    const cancelled = error === "Download cancelled";
    const silent = cancelled && this.pending.get(modId)?.silent;
    const mod = this.settle(modId, cancelled ? "cancelled" : "failed");
    if (!silent) mod?.onError(new Error(error));
  }

  /**
   * Resolves false when no queue entry tracked the mod. With `notify` off the
   * mod's error callback doesn't run, for a mod that is being deleted.
   */
  async cancel(modId: string, notify = true) {
    const entry = this.pending.get(modId);
    if (entry && !notify) entry.silent = true;
    try {
      await this.dependencies.cancel(modId);
    } catch (error) {
      if (entry) entry.silent = false;
      throw error;
    }
    if (!entry) return false;
    // Completion may enqueue another request while the cancellation IPC is pending.
    const mod = this.settle(modId, "cancelled", entry);
    if (notify) mod?.onError(new Error("Download cancelled"));
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
    return expected.mod;
  }
}
