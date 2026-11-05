import {
  cloneModelScene,
  disposeModelScene,
  modelSceneBytes,
  type ModelScene,
  type ModelSceneLease,
} from "./model-scene-resources";

interface Entry {
  controller: AbortController;
  pending: Promise<ModelScene>;
  model?: ModelScene;
  bytes: number;
  readers: number;
  viewers: number;
  evicted: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

/** Immutable parsed scenes, independently leased by viewers and bounded by decoded size. */
export class ModelSceneCache {
  private readonly entries = new Map<string, Entry>();
  private readonly maxBytes: number;
  private readonly maxEntries: number;
  private readonly idleMs: number;
  private hits = 0;
  private misses = 0;

  constructor({
    maxBytes = 256 * 1024 * 1024,
    maxEntries = 4,
    idleMs = 60_000,
  } = {}) {
    this.maxBytes = maxBytes;
    this.maxEntries = maxEntries;
    this.idleMs = idleMs;
  }

  stats() {
    return {
      entries: this.entries.size,
      bytes: [...this.entries.values()].reduce((sum, e) => sum + e.bytes, 0),
      hits: this.hits,
      misses: this.misses,
    };
  }

  private disposeUnused(entry: Entry) {
    if (
      entry.evicted &&
      entry.viewers === 0 &&
      entry.readers === 0 &&
      entry.model
    ) {
      disposeModelScene(entry.model);
      entry.model = undefined;
    }
  }

  private evict(key: string, entry: Entry) {
    if (this.entries.get(key) === entry) this.entries.delete(key);
    clearTimeout(entry.timer);
    entry.evicted = true;
    if (!entry.model) entry.controller.abort();
    this.disposeUnused(entry);
  }

  private trim() {
    let bytes = this.stats().bytes;
    for (const [key, entry] of this.entries) {
      if (bytes <= this.maxBytes && this.entries.size <= this.maxEntries) break;
      if (!entry.model) continue;
      bytes -= entry.bytes;
      this.evict(key, entry);
    }
  }

  clear() {
    for (const [key, entry] of this.entries) this.evict(key, entry);
  }

  async load(
    key: string,
    signal: AbortSignal,
    load: (signal: AbortSignal) => Promise<ModelScene>,
  ): Promise<ModelSceneLease> {
    signal.throwIfAborted();
    let entry = this.entries.get(key);
    if (entry) {
      this.hits++;
      clearTimeout(entry.timer);
      this.entries.delete(key);
      this.entries.set(key, entry);
    } else {
      this.misses++;
      const controller = new AbortController();
      const created: Entry = {
        controller,
        pending: Promise.resolve().then(() => load(controller.signal)),
        bytes: 0,
        readers: 0,
        viewers: 0,
        evicted: false,
      };
      created.pending = created.pending.then(
        (model) => {
          created.model = model;
          created.bytes = modelSceneBytes(model);
          this.disposeUnused(created);
          return model;
        },
        (error: Error) => {
          this.evict(key, created);
          throw error;
        },
      );
      entry = created;
      this.entries.set(key, entry);
    }
    const current = entry;
    current.readers++;
    let abort: (() => void) | undefined;
    try {
      const model = await Promise.race([
        current.pending,
        new Promise<never>((_resolve, reject) => {
          abort = () => {
            reject(signal.reason);
            if (current.readers === 1 && !current.model)
              this.evict(key, current);
          };
          signal.addEventListener("abort", abort, { once: true });
        }),
      ]);
      signal.throwIfAborted();
      const instance = cloneModelScene(model);
      current.viewers++;
      if (current.bytes > this.maxBytes) this.evict(key, current);
      this.trim();
      let disposed = false;
      return {
        ...instance,
        dispose: () => {
          if (disposed) return;
          disposed = true;
          disposeModelScene(instance, false);
          current.viewers--;
          if (
            !current.evicted &&
            current.viewers === 0 &&
            current.readers === 0
          )
            current.timer = setTimeout(
              () => this.evict(key, current),
              this.idleMs,
            );
          this.disposeUnused(current);
        },
      };
    } finally {
      if (abort) signal.removeEventListener("abort", abort);
      current.readers--;
      if (!current.model && current.readers === 0) this.evict(key, current);
      else if (
        !current.evicted &&
        current.viewers === 0 &&
        current.readers === 0
      )
        current.timer = setTimeout(() => this.evict(key, current), this.idleMs);
      this.disposeUnused(current);
    }
  }
}

export const previewModelCache = new ModelSceneCache();
if (import.meta.hot) import.meta.hot.dispose(() => previewModelCache.clear());
