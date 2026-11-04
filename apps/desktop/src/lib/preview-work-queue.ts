import { RuntimeError } from "@deadlock-mods/common/client-errors";

interface Work {
  priority: number;
  run: () => Promise<void>;
}

/** Serializes expensive preview analysis with cancellation for queued requests. */
export class PreviewWorkQueue {
  private pending: Work[] = [];
  private running = false;

  run<T>(
    work: () => Promise<T>,
    signal: AbortSignal,
    priority = 0,
  ): Promise<T> {
    signal.throwIfAborted();
    if (this.pending.length >= 64)
      return Promise.reject(new RuntimeError("Preview queue is full"));
    return new Promise((resolve, reject) => {
      const cancel = () => {
        this.pending = this.pending.filter((candidate) => candidate !== item);
        reject(new DOMException("Preview cancelled", "AbortError"));
      };
      const item: Work = {
        priority,
        run: async () => {
          try {
            signal.throwIfAborted();
            const value = await work();
            signal.throwIfAborted();
            resolve(value);
          } catch (error) {
            reject(error);
          } finally {
            signal.removeEventListener("abort", cancel);
          }
        },
      };
      signal.addEventListener("abort", cancel, { once: true });
      this.pending.push(item);
      this.pending.sort((left, right) => right.priority - left.priority);
      this.drain();
    });
  }

  private drain(): void {
    if (this.running) return;
    const next = this.pending.shift();
    if (!next) return;
    this.running = true;
    void next.run().finally(() => {
      this.running = false;
      this.drain();
    });
  }
}

export const previewAnalysisQueue = new PreviewWorkQueue();
export const previewCaptureQueue = new PreviewWorkQueue();
