import { beforeEach, describe, expect, it } from "bun:test";
import { createAnalyticsClient } from "../analytics/client";
import type { AnalyticsProperties } from "../analytics/schema";
import type { DownloadableMod } from "@/types/mods";
import { DownloadQueue } from "./queue";
interface PendingCommand {
  resolve: () => void;
  reject: (error: Error) => void;
}
const queues: PendingCommand[] = [];
const cancellations: PendingCommand[] = [];
const events: { name: string; properties: AnalyticsProperties }[] = [];
let nextId = 0;
const analytics = createAnalyticsClient({
  getContext: () => ({
    enabled: true,
    version: "2.1.0",
    os: "linux",
    releaseChannel: "stable",
    consentEpoch: 0,
  }),
  send: (name, properties) => {
    events.push({ name, properties });
  },
  now: () => 0,
  createId: () => String(++nextId),
});

const modData = {
  id: "fixture",
  remoteId: "fixture",
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
};

const request = (callbacks: string[], label: string): DownloadableMod => ({
  ...modData,
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
  analyticsEntryPoint: "catalog",
  onStart: () => {
    callbacks.push(`${label}:started`);
  },
  onProgress: () => {},
  onComplete: () => {
    callbacks.push(`${label}:completed`);
  },
  onError: () => {
    callbacks.push(`${label}:failed`);
  },
});
const completed = () => queue.complete(modData.remoteId, "fixture");
const outcomes = () =>
  events
    .filter((event) => event.name === "mod_download_result")
    .map((event) => event.properties.outcome);
const drain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
let queue: DownloadQueue;
beforeEach(() => {
  queues.length = 0;
  cancellations.length = 0;
  events.length = 0;
  nextId = 0;
  queue = new DownloadQueue({
    start: (properties) => analytics.start("mod_download", properties),
    queue: () =>
      new Promise<void>((resolve, reject) => {
        queues.push({ resolve, reject });
      }),
    cancel: () =>
      new Promise<void>((resolve, reject) => {
        cancellations.push({ resolve, reject });
      }),
    duplicateMessage: () => "Duplicate download",
    onQueueError: () => {},
  });
});

describe("download ownership", () => {
  it("rejects a duplicate without replacing the active callbacks or attempt", () => {
    const callbacks: string[] = [];
    queue.add(request(callbacks, "first"));
    queue.add({
      ...request(callbacks, "duplicate"),
      analyticsEntryPoint: "deep_link",
      profileFolder: "another-profile",
    });
    expect(queues).toHaveLength(1);
    expect(callbacks).toEqual(["duplicate:failed"]);
    queue.getMod(modData.remoteId)?.onStart();
    completed();
    expect(callbacks).toEqual([
      "duplicate:failed",
      "first:started",
      "first:completed",
    ]);
    expect(outcomes()).toEqual(["completed"]);
    expect(events[0]?.properties.entry_point).toBe("catalog");
  });
  it("does not let an old queue rejection fail a newly queued request", async () => {
    const callbacks: string[] = [];
    queue.add(request(callbacks, "first"));
    completed();
    queue.add(request(callbacks, "second"));
    queues[0]?.reject(new Error("Late queue rejection"));
    await drain();
    completed();
    expect(callbacks).toEqual(["first:completed", "second:completed"]);
    expect(outcomes()).toEqual(["completed", "completed"]);
  });
  it("clears ownership before a completion callback queues another request", () => {
    const callbacks: string[] = [];
    queue.add({
      ...request(callbacks, "first"),
      onComplete: () => {
        callbacks.push("first:completed");
        queue.add(request(callbacks, "second"));
      },
    });
    completed();
    expect(queues).toHaveLength(2);
    completed();
    expect(callbacks).toEqual(["first:completed", "second:completed"]);
    expect(outcomes()).toEqual(["completed", "completed"]);
  });
  it("does not let a delayed cancellation acknowledgement cancel the next request", async () => {
    const callbacks: string[] = [];
    queue.add(request(callbacks, "first"));
    const cancelling = queue.cancel(modData.remoteId);
    completed();
    queue.add(request(callbacks, "second"));
    cancellations[0]?.resolve();
    await cancelling;
    completed();
    expect(callbacks).toEqual(["first:completed", "second:completed"]);
    expect(outcomes()).toEqual(["completed", "completed"]);
  });
  it("settles cancellation once when the backend error arrives before acknowledgement", async () => {
    const callbacks: string[] = [];
    queue.add(request(callbacks, "first"));
    const cancelling = queue.cancel(modData.remoteId);
    queue.fail(modData.remoteId, "Download cancelled");
    cancellations[0]?.resolve();
    await cancelling;
    expect(callbacks).toEqual(["first:failed"]);
    expect(outcomes()).toEqual(["cancelled"]);
  });
  it("settles a cancellation without notify quietly, whichever arrives first", async () => {
    const callbacks: string[] = [];
    queue.add(request(callbacks, "first"));
    const acknowledged = queue.cancel(modData.remoteId, false);
    cancellations[0]?.resolve();
    expect(await acknowledged).toBe(true);
    queue.add(request(callbacks, "second"));
    const cancelling = queue.cancel(modData.remoteId, false);
    queue.fail(modData.remoteId, "Download cancelled");
    cancellations[1]?.resolve();
    await cancelling;
    expect(callbacks).toEqual([]);
    expect(outcomes()).toEqual(["cancelled", "cancelled"]);
  });
  it("keeps a quiet cancellation quiet when the download completes or fails first", async () => {
    const callbacks: string[] = [];
    queue.add(request(callbacks, "first"));
    const completing = queue.cancel(modData.remoteId, false);
    completed();
    cancellations[0]?.reject(new Error("No active download found"));
    await expect(completing).rejects.toThrow("No active download found");
    queue.add(request(callbacks, "second"));
    const failing = queue.cancel(modData.remoteId, false);
    queue.fail(modData.remoteId, "Network error");
    cancellations[1]?.resolve();
    await failing;
    expect(callbacks).toEqual([]);
    expect(outcomes()).toEqual(["completed", "failed"]);
    expect(queue.getMod(modData.remoteId)).toBeUndefined();
  });
  it("still reports a download whose quiet cancellation failed", async () => {
    const callbacks: string[] = [];
    queue.add(request(callbacks, "first"));
    const cancelling = queue.cancel(modData.remoteId, false);
    cancellations[0]?.reject(new Error("No active download found"));
    await expect(cancelling).rejects.toThrow("No active download found");
    queue.fail(modData.remoteId, "Download cancelled");
    expect(callbacks).toEqual(["first:failed"]);
    expect(outcomes()).toEqual(["cancelled"]);
  });
  it.each([true, false])(
    "keeps callbacks quiet when an overlapping cancel rejects (notify=%s)",
    async (notify) => {
      const callbacks: string[] = [];
      queue.add(request(callbacks, "first"));
      const quiet = queue.cancel(modData.remoteId, false);
      const overlapping = queue.cancel(modData.remoteId, notify);
      cancellations[1]?.reject(new Error("Cancellation failed"));
      await expect(overlapping).rejects.toThrow("Cancellation failed");

      completed();
      cancellations[0]?.resolve();
      await quiet;
      expect(callbacks).toEqual([]);
      expect(outcomes()).toEqual(["completed"]);
    },
  );
  it("restores callbacks after every quiet cancel rejects", async () => {
    const callbacks: string[] = [];
    queue.add(request(callbacks, "first"));
    const first = queue.cancel(modData.remoteId, false);
    const second = queue.cancel(modData.remoteId, false);
    cancellations[0]?.reject(new Error("First cancellation failed"));
    await expect(first).rejects.toThrow("First cancellation failed");
    cancellations[1]?.reject(new Error("Second cancellation failed"));
    await expect(second).rejects.toThrow("Second cancellation failed");

    completed();
    expect(callbacks).toEqual(["first:completed"]);
    expect(outcomes()).toEqual(["completed"]);
  });
});

describe("download start", () => {
  it("counts a download as started only once the backend starts it", () => {
    const callbacks: string[] = [];
    queue.add(request(callbacks, "first"));
    expect(queue.isStarted(modData.remoteId)).toBe(false);
    queue.start(modData.remoteId)?.onStart();
    expect(queue.isStarted(modData.remoteId)).toBe(true);
    expect(callbacks).toEqual(["first:started"]);
    completed();
    expect(queue.isStarted(modData.remoteId)).toBe(false);
  });
  it("waits again once resumed, until the backend runs it again", () => {
    queue.add(request([], "first"));
    queue.start(modData.remoteId);
    queue.requeue(modData.remoteId);
    expect(queue.isStarted(modData.remoteId)).toBe(false);
    queue.start(modData.remoteId);
    expect(queue.isStarted(modData.remoteId)).toBe(true);
  });
  it("does not carry the start over to the next request for the mod", () => {
    const callbacks: string[] = [];
    queue.add(request(callbacks, "first"));
    queue.start(modData.remoteId);
    queue.fail(modData.remoteId, "Network error");
    queue.add(request(callbacks, "retry"));
    expect(queue.isStarted(modData.remoteId)).toBe(false);
  });
  it("keeps a cancellation the backend makes quiet while one is expected", () => {
    const callbacks: string[] = [];
    queue.add(request(callbacks, "first"));
    const settle = queue.expectCancellations([modData.remoteId], null);
    queue.fail(modData.remoteId, "Download cancelled");
    settle(true);
    expect(callbacks).toEqual([]);
    expect(outcomes()).toEqual(["cancelled"]);
    expect(queue.getMod(modData.remoteId)).toBeUndefined();
  });
  it("still reports a failure while a cancellation is expected", () => {
    const callbacks: string[] = [];
    queue.add(request(callbacks, "first"));
    const settle = queue.expectCancellations([modData.remoteId], null);
    queue.fail(modData.remoteId, "Network error");
    expect(callbacks).toEqual(["first:failed"]);
    settle(false);
    expect(callbacks).toEqual(["first:failed"]);
  });
  it("drops a completion that came in while the operation went through", () => {
    const callbacks: string[] = [];
    queue.add(request(callbacks, "first"));
    const settle = queue.expectCancellations([modData.remoteId], null);
    completed();
    settle(true);
    expect(callbacks).toEqual([]);
  });
  it("reports a held completion once the operation didn't go through", () => {
    const callbacks: string[] = [];
    queue.add(request(callbacks, "first"));
    const settle = queue.expectCancellations([modData.remoteId], null);
    completed();
    expect(callbacks).toEqual([]);
    settle(false);
    expect(callbacks).toEqual(["first:completed"]);
  });
  it("ignores a download's late events once the operation went through", () => {
    const callbacks: string[] = [];
    queue.add(request(callbacks, "first"));
    queue.expectCancellations([modData.remoteId], null)(true);
    completed();
    expect(callbacks).toEqual([]);
    expect(queue.getMod(modData.remoteId)).toBeUndefined();
  });
  it("leaves another profile's download of the mod alone", () => {
    const callbacks: string[] = [];
    queue.add({ ...request(callbacks, "first"), profileFolder: "profile_b" });
    queue.expectCancellations([modData.remoteId], null)(true);
    completed();
    expect(callbacks).toEqual(["first:completed"]);
  });
  it("reports a cancellation again once the expectation is settled", () => {
    const callbacks: string[] = [];
    queue.add(request(callbacks, "first"));
    queue.expectCancellations([modData.remoteId], null)(false);
    queue.fail(modData.remoteId, "Download cancelled");
    expect(callbacks).toEqual(["first:failed"]);
  });
});
