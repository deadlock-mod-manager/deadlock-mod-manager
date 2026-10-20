import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import {
  checkForAppUpdates,
  installAppUpdate,
  type UpdateCheckResponse,
} from "./app-updates";

const available: UpdateCheckResponse = {
  context: {
    channel: "nightly",
    runtime: "wry",
    installer: "nsis",
    target: "windows-x86_64",
  },
  status: "available",
  metadata: {
    rid: 1,
    version: "2.1.0",
    currentVersion: "2.0.0",
    rawJson: {},
    downloadUrl: "https://example.com/app.exe",
  },
};

afterEach(() => mock.restore());

describe("app update download logging", () => {
  it("logs only lifecycle events for 1,000 chunks while forwarding every UI event", async () => {
    const info = spyOn(console, "info").mockImplementation(() => {});
    const clock = spyOn(performance, "now").mockReturnValue(1000);
    const progress = mock(() => {});
    const update = await checkForAppUpdates(async () => available);
    if (!update) throw new Error("Expected an update fixture");

    await installAppUpdate(update, progress, async (onEvent) => {
      onEvent?.({ event: "Started", data: { contentLength: 10_000 } });
      for (let i = 0; i < 1000; i++) {
        onEvent?.({ event: "Progress", data: { chunkLength: 10 } });
      }
      clock.mockReturnValue(2500);
      onEvent?.({ event: "Finished" });
    });

    expect(progress).toHaveBeenCalledTimes(1002);
    expect(info).toHaveBeenCalledTimes(3);
    const messages = info.mock.calls.map((args) => args.join(" "));
    expect(messages[0]).toContain("download started");
    expect(messages[1]).toContain("download finished");
    expect(messages[2]).toContain("installed");
    expect(messages[2]).toContain("downloaded=10000");
    expect(messages[2]).toContain("contentLength=10000");
    expect(messages[2]).toContain("elapsedMs=1500");
  });

  it("reports received bytes when the server does not supply a size", async () => {
    const info = spyOn(console, "info").mockImplementation(() => {});
    const update = await checkForAppUpdates(async () => available);
    if (!update) throw new Error("Expected an update fixture");
    await installAppUpdate(update, undefined, async (onEvent) => {
      onEvent?.({ event: "Started", data: {} });
      onEvent?.({ event: "Progress", data: { chunkLength: 20 } });
      onEvent?.({ event: "Finished" });
    });
    expect(info.mock.calls.at(-1)?.join(" ")).toContain(
      "downloaded=20 contentLength=unknown",
    );
  });

  it("reports partial bytes on failure and starts a retry with fresh totals", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const info = spyOn(console, "info").mockImplementation(() => {});
    const update = await checkForAppUpdates(async () => available);
    if (!update) throw new Error("Expected an update fixture");
    await expect(
      installAppUpdate(update, undefined, async (onEvent) => {
        onEvent?.({ event: "Started", data: { contentLength: 100 } });
        onEvent?.({ event: "Progress", data: { chunkLength: 30 } });
        throw new Error("Connection lost");
      }),
    ).rejects.toMatchObject({ reason: "Connection lost" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.join(" ")).toContain(
      "failed: downloaded=30 contentLength=100",
    );
    expect(info).toHaveBeenCalledTimes(1);

    info.mockClear();
    await installAppUpdate(update, undefined, async (onEvent) => {
      onEvent?.({ event: "Started", data: { contentLength: 100 } });
      onEvent?.({ event: "Progress", data: { chunkLength: 100 } });
      onEvent?.({ event: "Finished" });
    });
    expect(info.mock.calls.at(-1)?.join(" ")).toContain(
      "installed: downloaded=100 contentLength=100",
    );
  });
});
