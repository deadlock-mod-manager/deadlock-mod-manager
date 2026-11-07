import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";
import { createModHealthRefreshQueue } from "./mod-health-refresh";

const setup = () => {
  const calls: [string, string | null][] = [];
  const queue = createModHealthRefreshQueue({
    refreshFixes: (folder) => calls.push(["refreshFixes", folder]),
    checkHealth: (folder) => calls.push(["checkHealth", folder]),
  });
  return { calls, queue };
};

describe("mod health refresh queue", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  // An update that keeps the mod's VPK names only produces the backend event,
  // so that event alone has to recheck health.
  it("checks the profile's health after a backend-only library change", () => {
    const { calls, queue } = setup();

    queue.schedule("profile");
    jest.advanceTimersByTime(1499);
    expect(calls).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(calls).toEqual([
      ["refreshFixes", "profile"],
      ["checkHealth", "profile"],
    ]);
  });

  it("refreshes once when several change notifications arrive", () => {
    const { calls, queue } = setup();

    queue.schedule(null);
    jest.advanceTimersByTime(1000);
    queue.schedule(null);
    jest.advanceTimersByTime(1000);
    queue.schedule(null);
    jest.advanceTimersByTime(1499);
    expect(calls).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(calls).toEqual([
      ["refreshFixes", null],
      ["checkHealth", null],
    ]);

    // A review-required refresh produces no receipt. It must not be invoked
    // again by a second timer after the coalesced batch has already run.
    jest.advanceTimersByTime(3000);
    expect(calls).toHaveLength(2);
  });

  it("keeps profile timers independent", () => {
    const { calls, queue } = setup();

    queue.schedule(null);
    jest.advanceTimersByTime(1000);
    queue.schedule("other");
    jest.advanceTimersByTime(500);
    expect(calls).toEqual([
      ["refreshFixes", null],
      ["checkHealth", null],
    ]);
    jest.advanceTimersByTime(1000);
    expect(calls.slice(2)).toEqual([
      ["refreshFixes", "other"],
      ["checkHealth", "other"],
    ]);
  });

  it("allows subsequent library changes after a batch runs", () => {
    const { calls, queue } = setup();

    queue.schedule(null);
    jest.advanceTimersByTime(1500);
    queue.schedule(null);
    jest.advanceTimersByTime(1500);
    expect(calls).toHaveLength(4);
  });

  it("cancels all work on cleanup and starts fresh after effect remount", () => {
    const { calls, queue } = setup();

    queue.schedule(null);
    queue.schedule("other");
    queue.cancelAll();
    jest.advanceTimersByTime(3000);
    expect(calls).toEqual([]);

    queue.schedule(null);
    jest.advanceTimersByTime(1500);
    expect(calls).toEqual([
      ["refreshFixes", null],
      ["checkHealth", null],
    ]);
  });
});
