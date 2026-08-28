import { beforeEach, describe, expect, it } from "bun:test";
import { useModProgressStore } from "./mod-progress";

describe("mod progress store", () => {
  beforeEach(() => {
    useModProgressStore.getState().clearModProgress();
  });

  it("updates concurrent downloads independently", () => {
    const store = useModProgressStore.getState();
    store.setModProgress("mod-a", {
      progress: 25,
      progressTotal: 25,
      total: 100,
      transferSpeed: 1_024,
    });
    store.setModProgress("mod-b", {
      progress: 75,
      progressTotal: 75,
      total: 100,
      transferSpeed: 2_048,
    });

    expect(useModProgressStore.getState().progressByRemoteId).toEqual({
      "mod-a": { percentage: 25, speed: 1_024 },
      "mod-b": { percentage: 75, speed: 2_048 },
    });
  });

  it("clears one completed download without disturbing another", () => {
    const store = useModProgressStore.getState();
    store.setModProgress("mod-a", {
      progress: 50,
      progressTotal: 50,
      total: 100,
      transferSpeed: 1_024,
    });
    store.setModProgress("mod-b", {
      progress: 50,
      progressTotal: 50,
      total: 100,
      transferSpeed: 2_048,
    });

    store.removeModProgress("mod-a");

    expect(useModProgressStore.getState().progressByRemoteId).toEqual({
      "mod-b": { percentage: 50, speed: 2_048 },
    });
  });
});
