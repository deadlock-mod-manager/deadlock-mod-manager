import { getStore } from "@tauri-apps/plugin-store";
import type { StateStorage } from "zustand/middleware";
import logger from "@/lib/logger";
import { STORE_NAME } from "../constants";

const RETRY_DELAYS_MS: readonly number[] = [50, 150, 400];
let stateStorePath = STORE_NAME;
let pendingWrite: Promise<void> = Promise.resolve();
const lastQueued = new Map<string, string>();
let waitingWrite: { key: string; value: string } | undefined;

export const setStateStorePath = (path: string): void => {
  stateStorePath = path;
};

export type StorageReadyStatus = {
  ok: boolean;
  reason?: string;
};

let firstReadDone = false;
let writeGateLocked = false;
let storageReadyResolve: (status: StorageReadyStatus) => void = () => {};
let storageReadyPromise: Promise<StorageReadyStatus> =
  new Promise<StorageReadyStatus>((resolve) => {
    storageReadyResolve = resolve;
  });

export const storageReady = (): Promise<StorageReadyStatus> =>
  storageReadyPromise;

export const markStorageReady = (): void => {
  if (firstReadDone || writeGateLocked) return;
  firstReadDone = true;
  storageReadyResolve({ ok: true });
};

export const lockWriteGate = (reason: string): void => {
  if (firstReadDone) return;
  writeGateLocked = true;
  storageReadyResolve({ ok: false, reason });
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const tryRead = async (key: string): Promise<string | null> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const store = await getStore(stateStorePath);
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
    if (lastQueued.get(key) === value) {
      await pendingWrite;
      return;
    }
    lastQueued.set(key, value);
    if (waitingWrite?.key === key) {
      waitingWrite.value = value;
    } else {
      const write = { key, value };
      waitingWrite = write;
      pendingWrite = pendingWrite.then(async () => {
        if (waitingWrite === write) waitingWrite = undefined;
        try {
          const store = await getStore(stateStorePath);
          await store?.set(key, write.value);
          await store?.save();
        } catch (error) {
          if (lastQueued.get(key) === write.value) lastQueued.delete(key);
          logger
            .withError(error)
            .withMetadata({ key })
            .error("Persist setItem failed");
        }
      });
    }
    await pendingWrite;
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
    lastQueued.delete(key);
    waitingWrite = undefined;
    pendingWrite = pendingWrite.then(async () => {
      try {
        const store = await getStore(stateStorePath);
        await store?.delete(key);
        await store?.save();
      } catch (error) {
        logger
          .withError(error)
          .withMetadata({ key })
          .error("Persist removeItem failed");
      }
    });
    await pendingWrite;
  },
};

export default storage;

export const flushPendingWrites = (timeoutMs = 2000): Promise<void> =>
  Promise.race([pendingWrite, sleep(timeoutMs)]);

export const __resetForTests = (): void => {
  stateStorePath = STORE_NAME;
  pendingWrite = Promise.resolve();
  lastQueued.clear();
  waitingWrite = undefined;
  firstReadDone = false;
  writeGateLocked = false;
  storageReadyPromise = new Promise<StorageReadyStatus>((resolve) => {
    storageReadyResolve = resolve;
  });
};
