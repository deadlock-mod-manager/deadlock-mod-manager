import { getStore } from "@tauri-apps/plugin-store";
import type { StateStorage } from "zustand/middleware";
import logger from "@/lib/logger";
import { STORE_NAME } from "../constants";

const RETRY_DELAYS_MS: readonly number[] = [50, 150, 400];

export type StorageReadyStatus = {
  ok: boolean;
  reason?: string;
};

let firstReadDone = false;
let storageReadyResolve: (status: StorageReadyStatus) => void = () => {};
let storageReadyPromise: Promise<StorageReadyStatus> =
  new Promise<StorageReadyStatus>((resolve) => {
    storageReadyResolve = resolve;
  });

// Returns the promise that resolves once the very first getItem settles.
// `ok: true` means the persisted state was loaded (or was missing entirely);
// `ok: false` means the read failed permanently and the write gate stayed
// closed for this session, so subsequent setItem calls will no-op rather than
// clobber the on-disk blob with default state.
//
// Exposed as a function so tests (and dynamic re-imports) can observe the
// current latch even after `__resetForTests()` swaps it.
export const storageReady = (): Promise<StorageReadyStatus> =>
  storageReadyPromise;

// Idempotent. Callable from bootstrap to flip the write gate manually.
export const markStorageReady = (): void => {
  if (firstReadDone) return;
  firstReadDone = true;
  storageReadyResolve({ ok: true });
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const tryRead = async (key: string): Promise<string | null> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const store = await getStore(STORE_NAME);
      const value = await store?.get<string>(key);
      return value ?? null;
    } catch (error) {
      lastError = error;
      const isLast = attempt === RETRY_DELAYS_MS.length;
      logger
        .withError(error)
        .withMetadata({ key, attempt, isLast })
        .warn("Persist getItem attempt failed");
      if (isLast) break;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
};

const storage: StateStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const value = await tryRead(key);
      markStorageReady();
      return value;
    } catch (error) {
      // Permanent read failure: do NOT flip the gate. Leaving it closed means
      // subsequent setItem calls drop instead of clobbering the on-disk state
      // with whatever defaults the store has fallen back to. The app remains
      // usable in-memory; surfacing the failure is the App's responsibility
      // via the `storageReady` promise.
      const reason =
        error instanceof Error ? error.message : String(error ?? "unknown");
      storageReadyResolve({ ok: false, reason });
      logger
        .withError(error)
        .withMetadata({ key })
        .error(
          "Persist getItem failed permanently; write gate stays closed for this session",
        );
      return null;
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    if (!firstReadDone) {
      logger
        .withMetadata({ key })
        .warn(
          "Dropping persist setItem: write gate closed (first read not complete)",
        );
      return;
    }
    try {
      const store = await getStore(STORE_NAME);
      await store?.set(key, value);
      await store?.save();
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({ key })
        .error("Persist setItem failed");
    }
  },

  removeItem: async (key: string): Promise<void> => {
    if (!firstReadDone) {
      logger
        .withMetadata({ key })
        .warn(
          "Dropping persist removeItem: write gate closed (first read not complete)",
        );
      return;
    }
    try {
      const store = await getStore(STORE_NAME);
      await store?.delete(key);
      await store?.save();
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({ key })
        .error("Persist removeItem failed");
    }
  },
};

export default storage;

// Test-only escape hatch. Resets module state between test cases so each test
// can exercise the write gate from a clean slate. Not exported from index.
export const __resetForTests = (): void => {
  firstReadDone = false;
  storageReadyPromise = new Promise<StorageReadyStatus>((resolve) => {
    storageReadyResolve = resolve;
  });
};
