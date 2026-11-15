import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const showError = mock((_message: string) => {});
mock.module("@deadlock-mods/ui/components/sonner", () => ({
  toast: { error: showError },
}));
const invoke = mock(async (_command: string) => {});
mock.module("@tauri-apps/api/core", () => ({ invoke }));
mock.module("@/lib/logger", () => {
  const logger = {
    withMetadata: () => logger,
    withError: () => logger,
    error: () => {},
  };
  return { createLogger: () => logger, default: logger };
});
mock.module("@/lib/i18n", () => ({ default: { t: (key: string) => key } }));

const { useLaunchProgress } = await import("./launch-progress");

afterEach(() => useLaunchProgress.getState().clear());

describe("compatibility launch progress", () => {
  it("shows a check without a merge step when cached repairs are reused", () => {
    const store = useLaunchProgress.getState();
    store.start(
      ["verifyingMods", "checkingCompatibility", "writingSearchPaths"],
      2,
    );
    store.advance("checkingCompatibility");
    store.advance("writingSearchPaths");
    expect(useLaunchProgress.getState().progress?.steps).not.toContain(
      "mergingModData",
    );
    expect(useLaunchProgress.getState().progress?.current).toBe(
      "writingSearchPaths",
    );
  });

  it("adds rebuilding only when the backend reports a cache miss", () => {
    const store = useLaunchProgress.getState();
    store.start(
      ["verifyingMods", "checkingCompatibility", "writingSearchPaths"],
      2,
    );
    store.advance("checkingCompatibility");
    store.advance("mergingModData");
    expect(useLaunchProgress.getState().progress?.current).toBe(
      "mergingModData",
    );
    expect(useLaunchProgress.getState().progress?.steps).toEqual([
      "verifyingMods",
      "checkingCompatibility",
      "mergingModData",
      "writingSearchPaths",
    ]);
    store.advance("mergingModData");
    expect(
      useLaunchProgress
        .getState()
        .progress?.steps.filter((step) => step === "mergingModData"),
    ).toHaveLength(1);
  });

  it("ignores compatibility progress outside a modded launch", () => {
    const store = useLaunchProgress.getState();
    store.advance("mergingModData");
    expect(useLaunchProgress.getState().progress).toBeNull();
    store.start(["disablingMods", "openingSteam"], 0);
    store.advance("mergingModData");
    expect(useLaunchProgress.getState().progress?.current).toBe(
      "disablingMods",
    );
  });
});

describe("launch cancellation", () => {
  beforeEach(() => {
    invoke.mockReset();
    showError.mockReset();
    const store = useLaunchProgress.getState();
    store.begin();
    store.start(["openingSteam", "waitingForGame"], 2);
  });

  it("clears progress once the backend accepts, even if a step arrived meanwhile", async () => {
    const response = Promise.withResolvers<void>();
    invoke.mockReturnValue(response.promise);
    const cancellation = useLaunchProgress.getState().cancel();
    expect(useLaunchProgress.getState().cancelled).toBe(true);
    useLaunchProgress.getState().advance("waitingForGame");
    response.resolve();
    await cancellation;

    expect(useLaunchProgress.getState().cancelled).toBe(true);
    expect(useLaunchProgress.getState().progress).toBeNull();
    expect(showError).not.toHaveBeenCalled();
  });

  it("keeps progress and reports a rejected cancellation, even if a step arrived meanwhile", async () => {
    const response = Promise.withResolvers<void>();
    invoke.mockReturnValue(response.promise);
    const cancellation = useLaunchProgress.getState().cancel();
    useLaunchProgress.getState().advance("waitingForGame");
    response.reject(new Error("IPC unavailable"));
    await cancellation;

    expect(useLaunchProgress.getState().cancelled).toBe(false);
    expect(useLaunchProgress.getState().progress?.current).toBe(
      "waitingForGame",
    );
    expect(showError).toHaveBeenCalledTimes(1);
  });

  it("leaves a newer launch alone when an earlier cancellation settles late", async () => {
    const response = Promise.withResolvers<void>();
    invoke.mockReturnValue(response.promise);
    const cancellation = useLaunchProgress.getState().cancel();
    const store = useLaunchProgress.getState();
    store.clear();
    store.begin();
    store.start(["verifyingMods"], 3);
    response.resolve();
    await cancellation;

    expect(useLaunchProgress.getState().cancelled).toBe(false);
    expect(useLaunchProgress.getState().progress?.current).toBe(
      "verifyingMods",
    );
  });

  it("keeps a successful cancellation when an earlier click fails late", async () => {
    const first = Promise.withResolvers<void>();
    invoke.mockReturnValueOnce(first.promise);
    invoke.mockResolvedValueOnce(undefined);
    const store = useLaunchProgress.getState();
    const earlier = store.cancel();
    await store.cancel();
    first.reject(new Error("IPC unavailable"));
    await earlier;

    expect(useLaunchProgress.getState().cancelled).toBe(true);
    expect(useLaunchProgress.getState().progress).toBeNull();
  });

  it("keeps an accepted cancellation when a later click fails", async () => {
    const second = Promise.withResolvers<void>();
    invoke.mockResolvedValueOnce(undefined);
    invoke.mockReturnValueOnce(second.promise);
    const store = useLaunchProgress.getState();
    const first = store.cancel();
    const later = store.cancel();
    await first;
    second.reject(new Error("IPC unavailable"));
    await later;

    expect(useLaunchProgress.getState().cancelled).toBe(true);
    expect(useLaunchProgress.getState().progress).toBeNull();
  });

  it("keeps the cancellation while an earlier click is still pending", async () => {
    const earlier = Promise.withResolvers<void>();
    const newer = Promise.withResolvers<void>();
    invoke.mockReturnValueOnce(earlier.promise);
    invoke.mockReturnValueOnce(newer.promise);
    const store = useLaunchProgress.getState();
    const first = store.cancel();
    const second = store.cancel();
    newer.reject(new Error("IPC unavailable"));
    await second;
    expect(useLaunchProgress.getState().cancelled).toBe(true);

    earlier.reject(new Error("IPC unavailable"));
    await first;
    expect(useLaunchProgress.getState().cancelled).toBe(false);
  });
});
