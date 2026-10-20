import { afterEach, describe, expect, it } from "bun:test";
import { useLaunchProgress } from "./launch-progress";

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
