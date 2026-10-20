import { describe, expect, it, mock } from "bun:test";
import type { ModDto } from "@deadlock-mods/shared";
import type { ModDownloadItem } from "@/types/mods";

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
mock.module("@deadlock-mods/ui/components/sonner", () => ({
  toast: { success: noop, error: noop },
}));
// The backend accepts the request and is still downloading it.
mock.module("@tauri-apps/api/core", () => ({
  invoke: () => new Promise(() => {}),
}));
mock.module("@tauri-apps/api/event", () => ({ listen: async () => noop }));

const { queueModDownload } = await import("./use-download");
const { usePersistedStore } = await import("@/lib/store");
const { ModStatus } = await import("@/types/mods");

const file: ModDownloadItem = {
  url: "https://gamebanana.com/dl/1",
  name: "mod.zip",
  size: 1,
  md5Checksum: null,
  createdAt: null,
  updatedAt: null,
};

const mod = {
  id: "mod-1",
  remoteId: "1",
  name: "Fixture",
  isMap: false,
} as ModDto;

describe("queueModDownload", () => {
  it("leaves a running download's status alone when a second request for it is rejected", () => {
    const options = { allFiles: [file], profileFolder: null };
    queueModDownload(mod, [file], options);
    const rejected: Error[] = [];
    queueModDownload(mod, [file], {
      ...options,
      onError: (error) => rejected.push(error),
    });

    expect(rejected).toHaveLength(1);
    const status = usePersistedStore
      .getState()
      .localMods.find((m) => m.remoteId === mod.remoteId)?.status;
    expect(
      status,
      "the duplicate's rejection marked the first download failed while it kept writing",
    ).toBe(ModStatus.Downloading);
  });
});
