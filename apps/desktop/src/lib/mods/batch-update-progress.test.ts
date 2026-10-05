import { describe, expect, test } from "bun:test";
import type { UpdateProgress } from "@/types/mods";
import {
  applyDownloadProgress,
  getUpdatePercent,
} from "./batch-update-progress";

const downloading: UpdateProgress = {
  currentStep: "downloading",
  modIds: ["qol-lock", "other-mod"],
  currentModId: "qol-lock",
  currentMod: "QOL Lock",
  completedMods: 1,
  totalMods: 2,
  overallProgress: 50,
  isDownloading: true,
  isInstalling: false,
};

describe("applyDownloadProgress", () => {
  test("tracks the download percentage of the mod being updated", () => {
    const next = applyDownloadProgress(downloading, "qol-lock", 50);

    expect(next?.downloadPercentage).toBe(50);
    expect(next?.overallProgress).toBe(70);
  });

  test("ignores downloads for other mods", () => {
    expect(applyDownloadProgress(downloading, "other-mod", 50)).toBe(
      downloading,
    );
  });

  test("ignores progress once the mod is installing", () => {
    const installing = {
      ...downloading,
      currentStep: "installing",
      isDownloading: false,
      isInstalling: true,
    };

    expect(applyDownloadProgress(installing, "qol-lock", 50)).toBe(installing);
  });

  test("keeps the same progress when the percentage is unchanged", () => {
    const next = applyDownloadProgress(downloading, "qol-lock", 50);

    expect(applyDownloadProgress(next, "qol-lock", 50)).toBe(next);
  });

  test("ignores progress when no update is running", () => {
    expect(applyDownloadProgress(null, "qol-lock", 50)).toBeNull();
  });
});

describe("getUpdatePercent", () => {
  test("returns the rounded overall progress for mods in the update", () => {
    expect(
      getUpdatePercent({ ...downloading, overallProgress: 42.6 }, "qol-lock"),
    ).toBe(43);
  });

  test("returns the overall progress when no mod is given", () => {
    expect(getUpdatePercent(downloading)).toBe(50);
  });

  test("ignores mods outside the update", () => {
    expect(getUpdatePercent(downloading, "unrelated")).toBeUndefined();
  });

  test("returns undefined when no update is running", () => {
    expect(getUpdatePercent(null, "qol-lock")).toBeUndefined();
  });
});
