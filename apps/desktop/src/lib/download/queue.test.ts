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
    duplicateError: () => new Error("Duplicate download"),
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
});
