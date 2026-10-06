import { getErrorMessage } from "@/lib/errors";
import {
  modContentType,
  type AnalyticsAttempt,
  type AnalyticsOperations,
  type AnalyticsOutcome,
} from "@/lib/analytics/schema";
import type { DownloadableMod } from "@/types/mods";

interface PendingDownload {
  mod: DownloadableMod;
  attempt: AnalyticsAttempt<"mod_download">;
}
interface DownloadQueueDependencies {
  start: (
    properties: AnalyticsOperations["mod_download"]["start"],
  ) => AnalyticsAttempt<"mod_download">;
  queue: (mod: DownloadableMod) => Promise<void>;
  cancel: (modId: string) => Promise<void>;
  duplicateError: () => Error;
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
      mod.onError(this.dependencies.duplicateError());
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
    this.settle(
      modId,
      error === "Download cancelled" ? "cancelled" : "failed",
    )?.onError(new Error(error));
  }

  async cancel(modId: string) {
    const entry = this.pending.get(modId);
    await this.dependencies.cancel(modId);
    // Completion may enqueue another request while the cancellation IPC is pending.
    if (entry)
      this.settle(modId, "cancelled", entry)?.onError(
        new Error("Download cancelled"),
      );
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
