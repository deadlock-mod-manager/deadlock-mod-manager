import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
  mock,
} from "bun:test";
import { createModHealthRefreshQueue } from "./mod-health-refresh";

describe("mod health refresh queue", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it.each([true, false])(
    "refreshes once when both change notifications arrive (backend first: %s)",
    (backendFirst) => {
      const refresh = mock<(folder: string | null, modIds: string[]) => void>();
      const queue = createModHealthRefreshQueue(refresh);

      queue.schedule(null, backendFirst ? [] : ["installed-mod"]);
      jest.advanceTimersByTime(1000);
      queue.schedule(null, backendFirst ? ["installed-mod"] : []);
      jest.advanceTimersByTime(1499);
      expect(refresh).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(refresh.mock.calls).toEqual([[null, ["installed-mod"]]]);

      // A review-required refresh produces no receipt. It must not be invoked
      // again by a second timer after the coalesced batch has already run.
      jest.advanceTimersByTime(3000);
      expect(refresh).toHaveBeenCalledTimes(1);
    },
  );

  it("batches collection installs without losing or duplicating health checks", () => {
    const refresh = mock<(folder: string | null, modIds: string[]) => void>();
    const queue = createModHealthRefreshQueue(refresh);

    queue.schedule("collection", ["first"]);
    jest.advanceTimersByTime(1000);
    queue.schedule("collection", ["first", "second"]);
    jest.advanceTimersByTime(1000);
    queue.schedule("collection");
    jest.advanceTimersByTime(1500);

    expect(refresh.mock.calls).toEqual([["collection", ["first", "second"]]]);
  });

  it("keeps profile timers and pending mod IDs independent", () => {
    const refresh = mock<(folder: string | null, modIds: string[]) => void>();
    const queue = createModHealthRefreshQueue(refresh);

    queue.schedule(null, ["default-mod"]);
    jest.advanceTimersByTime(1000);
    queue.schedule("other", ["other-mod"]);
    jest.advanceTimersByTime(500);
    expect(refresh.mock.calls).toEqual([[null, ["default-mod"]]]);
    jest.advanceTimersByTime(1000);
    expect(refresh.mock.calls).toEqual([
      [null, ["default-mod"]],
      ["other", ["other-mod"]],
    ]);
  });

  it("refreshes event-only changes and allows subsequent library changes", () => {
    const refresh = mock<(folder: string | null, modIds: string[]) => void>();
    const queue = createModHealthRefreshQueue(refresh);

    queue.schedule(null);
    jest.advanceTimersByTime(1500);
    queue.schedule(null, ["new-mod"]);
    jest.advanceTimersByTime(1500);
    expect(refresh.mock.calls).toEqual([
      [null, []],
      [null, ["new-mod"]],
    ]);
  });

  it("cancels all work on cleanup and starts fresh after effect remount", () => {
    const refresh = mock<(folder: string | null, modIds: string[]) => void>();
    const queue = createModHealthRefreshQueue(refresh);

    queue.schedule(null, ["cancelled"]);
    queue.schedule("other");
    queue.cancelAll();
    jest.advanceTimersByTime(3000);
    expect(refresh).not.toHaveBeenCalled();

    queue.schedule(null, ["new-mod"]);
    jest.advanceTimersByTime(1500);
    expect(refresh.mock.calls).toEqual([[null, ["new-mod"]]]);
  });
});
