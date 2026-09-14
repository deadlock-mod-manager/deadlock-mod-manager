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
    const newer = storage.setItem("local-config", "installed-and-enabled");
    await setImmediate();
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
    let lookups = 0;
    getStoreImpl = async () => {
      if (++lookups === 1) throw new Error("write rejected");
      return backend;
    };
    await Promise.all([
      storage.setItem("local-config", "failed"),
      storage.setItem("local-config", "latest"),
    ]);
    expect(memory.get("local-config")).toBe("latest");
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
