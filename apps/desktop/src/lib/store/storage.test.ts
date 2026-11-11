import { beforeEach, describe, expect, it, mock } from "bun:test";
import { setImmediate } from "node:timers/promises";

type BackingStore = {
  get: (key: string) => Promise<string | undefined>;
  set: (key: string, value: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
  save: () => Promise<void>;
};

const memory = new Map<string, string>();
let getStoreImpl: () => Promise<BackingStore> = async () => ({
  get: async (k) => memory.get(k),
  set: async (k, v) => {
    memory.set(k, v);
  },
  delete: async (k) => {
    memory.delete(k);
  },
  save: async () => {},
});

mock.module("@tauri-apps/plugin-store", () => ({
  getStore: () => getStoreImpl(),
}));

mock.module("@/lib/logger", () => {
  const noop = () => undefined;
  const make = (): Record<string, unknown> => {
    const obj: Record<string, unknown> = {};
    obj.withMetadata = () => make();
    obj.withError = () => make();
    obj.warn = noop;
    obj.error = noop;
    obj.info = noop;
    obj.debug = noop;
    obj.trace = noop;
    return obj;
  };
  return { createLogger: () => make(), default: make() };
});

const storageModule = await import("./storage");
const storage = storageModule.default;

describe("storage write gate", () => {
  beforeEach(() => {
    memory.clear();
    storageModule.__resetForTests();
    // Reset the getStore mock to the in-memory backend.
    getStoreImpl = async () => ({
      get: async (k) => memory.get(k),
      set: async (k, v) => {
        memory.set(k, v);
      },
      delete: async (k) => {
        memory.delete(k);
      },
      save: async () => {},
    });
  });

  it("drops setItem before any getItem has completed", async () => {
    await storage.setItem("local-config", JSON.stringify({ ghost: true }));
    expect(memory.has("local-config")).toBe(false);
  });

  it("preserves snapshot order when the first store lookup is delayed", async () => {
    storageModule.markStorageReady();
    const backend = await getStoreImpl();
    const firstLookup = Promise.withResolvers<void>();
    let lookups = 0;
    getStoreImpl = async () => {
      if (++lookups === 1) await firstLookup.promise;
      return backend;
    };
    const older = storage.setItem("local-config", "installed");
    await setImmediate();
    const newer = storage.setItem("local-config", "installed-and-enabled");
    firstLookup.resolve();
    await Promise.all([older, newer]);
    expect(memory.get("local-config")).toBe("installed-and-enabled");
  });

  it("does not resurrect state when deletion follows a delayed write", async () => {
    storageModule.markStorageReady();
    const backend = await getStoreImpl();
    const firstLookup = Promise.withResolvers<void>();
    let lookups = 0;
    getStoreImpl = async () => {
      if (++lookups === 1) await firstLookup.promise;
      return backend;
    };
    const write = storage.setItem("local-config", "obsolete");
    const deletion = storage.removeItem("local-config");
    await setImmediate();
    firstLookup.resolve();
    await Promise.all([write, deletion]);
    expect(memory.has("local-config")).toBe(false);
  });

  it("continues saving after a queued write fails", async () => {
    storageModule.markStorageReady();
    const backend = await getStoreImpl();
    const firstLookup = Promise.withResolvers<void>();
    let lookups = 0;
    getStoreImpl = async () => {
      if (++lookups === 1) {
        await firstLookup.promise;
        throw new Error("write rejected");
      }
      return backend;
    };
    const failed = storage.setItem("local-config", "failed");
    await setImmediate();
    const latest = storage.setItem("local-config", "latest");
    firstLookup.resolve();
    await Promise.all([failed, latest]);
    expect(memory.get("local-config")).toBe("latest");
  });

  it("skips a snapshot identical to the last queued one", async () => {
    storageModule.markStorageReady();
    const backend = await getStoreImpl();
    let writes = 0;
    getStoreImpl = async () => ({
      ...backend,
      set: async (k, v) => {
        writes++;
        await backend.set(k, v);
      },
    });
    const pending = [storage.setItem("local-config", "downloading")];
    await setImmediate();
    pending.push(
      storage.setItem("local-config", "downloading"),
      storage.setItem("local-config", "downloading"),
      storage.setItem("local-config", "installed"),
    );
    await Promise.all(pending);
    expect(writes).toBe(2);
    expect(memory.get("local-config")).toBe("installed");
  });

  it("writes only the newest snapshot queued behind a save in progress", async () => {
    storageModule.markStorageReady();
    const backend = await getStoreImpl();
    const firstLookup = Promise.withResolvers<void>();
    const written: string[] = [];
    let lookups = 0;
    getStoreImpl = async () => {
      if (++lookups === 1) await firstLookup.promise;
      return {
        ...backend,
        set: async (k, v) => {
          written.push(v);
          await backend.set(k, v);
        },
      };
    };
    const saves = [storage.setItem("local-config", "hero-1")];
    await setImmediate();
    for (const snapshot of ["hero-2", "hero-3", "hero-4"]) {
      saves.push(storage.setItem("local-config", snapshot));
    }
    firstLookup.resolve();
    await Promise.all(saves);
    expect(written).toEqual(["hero-1", "hero-4"]);
    expect(memory.get("local-config")).toBe("hero-4");
  });

  it("writes a snapshot that arrives while a merged save is running", async () => {
    storageModule.markStorageReady();
    const backend = await getStoreImpl();
    const firstLookup = Promise.withResolvers<void>();
    const mergedSave = Promise.withResolvers<void>();
    const saving = Promise.withResolvers<void>();
    let lookups = 0;
    let saves = 0;
    getStoreImpl = async () => {
      if (++lookups === 1) await firstLookup.promise;
      return {
        ...backend,
        save: async () => {
          if (++saves !== 2) return;
          saving.resolve();
          await mergedSave.promise;
        },
      };
    };
    const pending = [storage.setItem("local-config", "installed")];
    await setImmediate();
    pending.push(
      storage.setItem("local-config", "enabled"),
      storage.setItem("local-config", "reordered"),
    );
    firstLookup.resolve();
    await saving.promise;
    pending.push(storage.setItem("local-config", "disabled"));
    mergedSave.resolve();
    await Promise.all(pending);
    expect(memory.get("local-config")).toBe("disabled");
  });

  it("keeps a snapshot queued after a deletion behind that deletion", async () => {
    storageModule.markStorageReady();
    const backend = await getStoreImpl();
    const firstLookup = Promise.withResolvers<void>();
    let lookups = 0;
    getStoreImpl = async () => {
      if (++lookups === 1) await firstLookup.promise;
      return backend;
    };
    const pending = [
      storage.setItem("local-config", "installed"),
      storage.setItem("local-config", "enabled"),
      storage.removeItem("local-config"),
      storage.setItem("local-config", "reinstalled"),
    ];
    await setImmediate();
    firstLookup.resolve();
    await Promise.all(pending);
    expect(memory.get("local-config")).toBe("reinstalled");
  });

  it("retries the newest snapshot after a merged save failed", async () => {
    storageModule.markStorageReady();
    const backend = await getStoreImpl();
    let lookups = 0;
    getStoreImpl = async () => {
      if (++lookups === 2) throw new Error("write rejected");
      return backend;
    };
    await storage.setItem("local-config", "installed");
    await Promise.all([
      storage.setItem("local-config", "enabled"),
      storage.setItem("local-config", "reordered"),
    ]);
    await storage.setItem("local-config", "reordered");
    expect(memory.get("local-config")).toBe("reordered");
  });

  it("retries an identical snapshot after its write failed", async () => {
    storageModule.markStorageReady();
    const backend = await getStoreImpl();
    let lookups = 0;
    getStoreImpl = async () => {
      if (++lookups === 1) throw new Error("write rejected");
      return backend;
    };
    await storage.setItem("local-config", "installed");
    await storage.setItem("local-config", "installed");
    expect(memory.get("local-config")).toBe("installed");
  });

  it("writes a snapshot again after the key was removed", async () => {
    storageModule.markStorageReady();
    await storage.setItem("local-config", "installed");
    await storage.removeItem("local-config");
    await storage.setItem("local-config", "installed");
    expect(memory.get("local-config")).toBe("installed");
  });

  it("flushPendingWrites resolves after queued writes land", async () => {
    storageModule.markStorageReady();
    const backend = await getStoreImpl();
    const lookup = Promise.withResolvers<void>();
    getStoreImpl = async () => {
      await lookup.promise;
      return backend;
    };
    void storage.setItem("local-config", "installed");
    const flushed = storageModule.flushPendingWrites();
    await setImmediate();
    expect(memory.has("local-config")).toBe(false);
    lookup.resolve();
    await flushed;
    expect(memory.get("local-config")).toBe("installed");
  });

  it("drops removeItem before any getItem has completed", async () => {
    memory.set("local-config", "preexisting");
    await storage.removeItem("local-config");
    expect(memory.get("local-config")).toBe("preexisting");
  });

  it("allows setItem after a successful getItem flips the gate", async () => {
    memory.set("local-config", "v1");
    await storage.getItem("local-config");
    await storage.setItem("local-config", "v2");
    expect(memory.get("local-config")).toBe("v2");
  });

  it("storageReady resolves with ok=true after a successful read", async () => {
    memory.set("local-config", "v1");
    await storage.getItem("local-config");
    const status = await storageModule.storageReady();
    expect(status.ok).toBe(true);
  });

  it("markStorageReady flips the gate without a getItem call", async () => {
    storageModule.markStorageReady();
    await storage.setItem("local-config", "from-mark");
    expect(memory.get("local-config")).toBe("from-mark");
    const status = await storageModule.storageReady();
    expect(status.ok).toBe(true);
  });

  it("returns null and keeps gate closed when getItem fails permanently", async () => {
    let callCount = 0;
    getStoreImpl = async () => {
      callCount++;
      throw new Error("tauri plugin not ready");
    };

    const result = await storage.getItem("local-config");
    expect(result).toBe(null);
    // 1 initial + 3 retries = 4 attempts.
    expect(callCount).toBe(4);

    // Subsequent setItem must be dropped to avoid clobbering the on-disk state.
    memory.set("local-config", "preexisting");
    await storage.setItem("local-config", "should-be-dropped");
    expect(memory.get("local-config")).toBe("preexisting");

    const status = await storageModule.storageReady();
    expect(status.ok).toBe(false);
    expect(status.reason).toContain("tauri plugin not ready");
  });

  it("keeps the gate closed after a locked startup even when reads succeed", async () => {
    storageModule.lockWriteGate("state.json: Access is denied");

    expect(await storage.getItem("local-config")).toBe(null);
    await storage.setItem("local-config", "defaults");
    expect(memory.has("local-config")).toBe(false);

    const status = await storageModule.storageReady();
    expect(status).toEqual({
      ok: false,
      reason: "state.json: Access is denied",
    });
  });

  it("retries getItem and succeeds on the 3rd attempt", async () => {
    let callCount = 0;
    getStoreImpl = async () => {
      callCount++;
      if (callCount < 3) {
        throw new Error("transient");
      }
      return {
        get: async () => "v-from-retry",
        set: async () => {},
        delete: async () => {},
        save: async () => {},
      };
    };

    const result = await storage.getItem("local-config");
    expect(result).toBe("v-from-retry");
    expect(callCount).toBe(3);
    const status = await storageModule.storageReady();
    expect(status.ok).toBe(true);
  });

  it("propagates setItem failures to the logger but does not throw", async () => {
    storageModule.markStorageReady();
    getStoreImpl = async () => {
      throw new Error("write rejected");
    };
    await expect(
      storage.setItem("local-config", "data"),
    ).resolves.toBeUndefined();
  });
});
