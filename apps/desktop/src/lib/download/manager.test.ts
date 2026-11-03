import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import * as tauriCore from "@tauri-apps/api/core";
import type { DownloadableMod } from "@/types/mods";

const noop = () => undefined;
const loggerMock = {
  withMetadata() {
    return this;
  },
  withError() {
    return this;
  },
  warn: noop,
  error: noop,
  info: noop,
  debug: noop,
  trace: noop,
};

mock.module("@tauri-apps/plugin-store", () => ({
  getStore: async () => ({
    get: async () => undefined,
    set: async () => {},
    delete: async () => {},
  }),
}));
mock.module("@/lib/logger", () => ({
  createLogger: () => loggerMock,
  default: loggerMock,
}));
mock.module("@tauri-apps/plugin-log", () => ({
  debug: noop,
  error: noop,
  info: noop,
  trace: noop,
  warn: noop,
}));
mock.module("@/lib/plugins", () => ({ getPlugins: () => [] }));

type Payload = Record<string, string | number | null | undefined>;
const handlers = new Map<string, (event: { payload: Payload }) => void>();
/** The attempt each `queue_download` call named, in order. */
const queued: (string | undefined)[] = [];
/** What `get_all_downloads` reports to the startup reconciliation. */
const running: { modId: string }[] = [];
/** The mod each `cancel_download` call named, in order. */
const cancelled: (string | undefined)[] = [];

// The backend accepts every request at once; events arrive only when a test
// delivers them, so their order relative to commands is the test's to choose.
mock.module("@tauri-apps/api/core", () => ({
  ...tauriCore,
  invoke: async (
    command: string,
    args?: { attemptId?: string; modId?: string },
  ) => {
    if (command === "queue_download") queued.push(args?.attemptId);
    if (command === "cancel_download") cancelled.push(args?.modId);
    if (command === "get_all_downloads") return running;
    return undefined;
  },
}));
mock.module("@tauri-apps/api/event", () => ({
  listen: async (
    event: string,
    handler: (event: { payload: Payload }) => void,
  ) => {
    handlers.set(event, handler);
    return noop;
  },
}));

const { downloadManager } = await import("./manager");

const MOD_ID = "fixture";
const deliver = (event: string, attemptId: string | undefined, rest = {}) => {
  const handler = handlers.get(event);
  if (!handler) throw new Error(`No listener for ${event}`);
  handler({ payload: { modId: MOD_ID, attemptId, ...rest } });
};
const cancelledError = {
  error: "Download failed: Download cancelled",
  reason: null,
  retryAfterSecs: null,
};

const request = (callbacks: string[], label: string): DownloadableMod => ({
  id: MOD_ID,
  remoteId: MOD_ID,
  name: "Fixture",
  description: null,
  remoteUrl: "https://gamebanana.com/mods/1",
  category: "Skins",
  likes: 0,
  author: "Fixture",
  modAuthorId: null,
  downloadable: true,
  remoteAddedAt: new Date(0),
  remoteUpdatedAt: new Date(0),
  tags: [],
  images: [],
  hero: null,
  isAudio: false,
  isMap: false,
  audioUrl: null,
  downloadCount: 0,
  isNSFW: false,
  isObsolete: false,
  isBlacklisted: false,
  blacklistReason: null,
  blacklistedAt: null,
  blacklistedBy: null,
  filesUpdatedAt: null,
  metadata: null,
  dependencies: null,
  overrides: null,
  createdAt: null,
  updatedAt: null,
  downloads: [
    {
      url: "https://example.test/mod.zip",
      name: "mod.zip",
      size: 1,
      md5Checksum: null,
      createdAt: null,
      updatedAt: null,
    },
  ],
  onStart: () => {
    callbacks.push(`${label}:started`);
  },
  onProgress: () => {},
  onComplete: () => {
    callbacks.push(`${label}:completed`);
  },
  onError: (error) => {
    callbacks.push(`${label}:failed:${error.message}`);
  },
});

beforeEach(async () => {
  queued.length = 0;
  running.length = 0;
  cancelled.length = 0;
  await downloadManager.init();
});
afterEach(async () => {
  await downloadManager.cleanup();
});

describe("download events from an earlier attempt", () => {
  it("do not fail a retry queued after the user cancelled", async () => {
    const callbacks: string[] = [];
    downloadManager.addToQueue(request(callbacks, "first"));
    const [first] = queued;
    deliver("download-started", first);
    await downloadManager.cancelDownload(MOD_ID);

    downloadManager.addToQueue(request(callbacks, "retry"));
    const retry = queued[1];
    // The cancelled worker noticed its token only after Retry was clicked.
    deliver("download-error", first, cancelledError);
    deliver("download-started", retry);
    deliver("download-error", first, cancelledError);
    deliver("download-completed", retry, { path: "/mods/fixture" });

    expect(callbacks).toEqual([
      "first:started",
      "first:failed:Download cancelled",
      "retry:started",
      "retry:completed",
    ]);
  });

  it("do not fail a retry queued after a reload cancelled the orphan", async () => {
    const callbacks: string[] = [];
    downloadManager.addToQueue(request(callbacks, "orphan"));
    const [orphan] = queued;
    deliver("download-started", orphan);
    // A reload drops the queue entries and starts listening again.
    await downloadManager.cleanup();
    running.push({ modId: MOD_ID });
    await downloadManager.init();
    expect(cancelled).toEqual([MOD_ID]);

    downloadManager.addToQueue(request(callbacks, "retry"));
    const retry = queued[1];
    deliver("download-error", orphan, cancelledError);
    deliver("download-started", retry);
    deliver("download-completed", retry, { path: "/mods/fixture" });

    expect(callbacks).toEqual([
      "orphan:started",
      "retry:started",
      "retry:completed",
    ]);
  });

  it("still fail the retry when the retry itself fails", async () => {
    const callbacks: string[] = [];
    downloadManager.addToQueue(request(callbacks, "first"));
    await downloadManager.cancelDownload(MOD_ID);
    downloadManager.addToQueue(request(callbacks, "retry"));
    const retry = queued[1];
    deliver("download-started", retry);
    deliver("download-error", retry, {
      error: "Server returned error status 404",
      reason: null,
      retryAfterSecs: null,
    });

    expect(callbacks).toEqual([
      "first:failed:Download cancelled",
      "retry:started",
      "retry:failed:Server returned error status 404",
    ]);
  });
});
