import { describe, expect, it } from "bun:test";
import {
  UpdateDownloadSession,
  type UpdateDownloadFailureEvent,
  type UpdateDownloadInfoEvent,
} from "./update-download-session";

describe("update download session", () => {
  it("bounds INFO events and coalesces hundreds of chunk callbacks", () => {
    const infoEvents: UpdateDownloadInfoEvent[] = [];
    const failureEvents: UpdateDownloadFailureEvent[] = [];
    const percentages: number[] = [];
    const frames = new Map<number, () => void>();
    let now = 1_000;
    let nextFrame = 1;
    const session = new UpdateDownloadSession({
      now: () => now,
      scheduleFrame: (callback) => {
        const handle = nextFrame;
        nextFrame += 1;
        frames.set(handle, callback);
        return handle;
      },
      cancelFrame: (handle) => frames.delete(handle),
      onProgress: (percentage) => percentages.push(percentage),
      onInfo: (event) => infoEvents.push(event),
      onFailure: (event) => failureEvents.push(event),
    });

    session.begin();
    session.started(100_000);
    for (let index = 0; index < 500; index += 1) {
      session.progressed(200);
    }
    expect(frames.size).toBe(1);
    frames.get(1)?.();
    now = 2_250;
    session.completed();

    expect(infoEvents).toEqual([
      { kind: "started", artifactSizeBytes: 100_000 },
      {
        kind: "completed",
        artifactSizeBytes: 100_000,
        downloadedBytes: 100_000,
        elapsedMs: 1_250,
      },
    ]);
    expect(failureEvents).toEqual([]);
    expect(percentages).toEqual([0, 100]);
  });

  it("records final byte count and elapsed time when an update fails", () => {
    const infoEvents: UpdateDownloadInfoEvent[] = [];
    const failureEvents: UpdateDownloadFailureEvent[] = [];
    let now = 5_000;
    const session = new UpdateDownloadSession({
      now: () => now,
      scheduleFrame: () => 1,
      cancelFrame: () => undefined,
      onProgress: () => undefined,
      onInfo: (event) => infoEvents.push(event),
      onFailure: (event) => failureEvents.push(event),
    });

    session.begin();
    session.started(1_000);
    session.progressed(400);
    now = 5_750;
    session.failed("network unavailable");

    expect(infoEvents).toEqual([{ kind: "started", artifactSizeBytes: 1_000 }]);
    expect(failureEvents).toEqual([
      {
        kind: "failed",
        artifactSizeBytes: 1_000,
        downloadedBytes: 400,
        elapsedMs: 750,
        errorMessage: "network unavailable",
      },
    ]);
  });
});
