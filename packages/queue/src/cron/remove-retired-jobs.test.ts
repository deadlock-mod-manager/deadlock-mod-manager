import { describe, expect, it, mock } from "bun:test";
import { removeRetiredCronJobs } from "./remove-retired-jobs";

const retired = "GamebananaRssProcessor";

describe("retired cron cleanup", () => {
  it("removes only retired schedulers and pending jobs, including legacy repeatables", async () => {
    const removeRetired = mock(async () => {});
    const removeCurrent = mock(async () => {});
    const removeScheduler = mock(async (_key: string) => true);
    const removeRepeatable = mock(async (_key: string) => true);
    const getJobs = mock(async (_types: string[]) => [
      { name: retired, remove: removeRetired },
      { name: "ModsSyncProcessor", remove: removeCurrent },
    ]);
    const queue = {
      getJobSchedulers: async () => [
        { key: "retired-scheduler-key", name: retired },
        { key: "sync-key", name: "ModsSyncProcessor" },
      ],
      removeJobScheduler: removeScheduler,
      getRepeatableJobs: async () => [
        { key: "legacy-rss-key", name: retired },
        { key: "relay-key", name: "RelayDiscoveryProcessor" },
      ],
      removeRepeatableByKey: removeRepeatable,
      getJobs,
    };
    await removeRetiredCronJobs(queue, [retired]);
    expect(removeScheduler).toHaveBeenCalledTimes(1);
    expect(removeScheduler).toHaveBeenCalledWith("retired-scheduler-key");
    expect(removeRepeatable).toHaveBeenCalledTimes(1);
    expect(removeRepeatable).toHaveBeenCalledWith("legacy-rss-key");
    expect(removeRetired).toHaveBeenCalledTimes(1);
    expect(removeCurrent).not.toHaveBeenCalled();
    expect(getJobs.mock.calls[0][0]).not.toContain("active");
    expect(getJobs.mock.calls[0][0]).not.toContain("failed");
  });

  it("is safe to run after the retired entries are gone", async () => {
    const remove = mock(async (_key: string) => true);
    const queue = {
      getJobSchedulers: async () => [],
      removeJobScheduler: remove,
      getRepeatableJobs: async () => [],
      removeRepeatableByKey: remove,
      getJobs: async () => [],
    };
    await removeRetiredCronJobs(queue, [retired]);
    await removeRetiredCronJobs(queue, [retired]);
    expect(remove).not.toHaveBeenCalled();
  });

  it("propagates cleanup failures so consumption does not start with stale schedules", async () => {
    const queue = {
      getJobSchedulers: async () => [{ key: "rss-key", name: retired }],
      removeJobScheduler: async () => {
        throw new Error("Redis unavailable");
      },
      getRepeatableJobs: async () => [],
      removeRepeatableByKey: async () => false,
      getJobs: async () => [],
    };
    await expect(removeRetiredCronJobs(queue, [retired])).rejects.toThrow(
      "Redis unavailable",
    );
  });
});
