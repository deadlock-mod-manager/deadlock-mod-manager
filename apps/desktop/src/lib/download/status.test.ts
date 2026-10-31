import { describe, expect, it } from "bun:test";
import { ModStatus } from "@/types/mods";
import {
  isDownloadComplete,
  isDownloadFailed,
  isDownloadInProgress,
} from "./status";

describe("download history status", () => {
  it.each([ModStatus.FailedToDownload, ModStatus.Error])(
    "keeps %s out of completed history",
    (status) => {
      expect(isDownloadComplete(status)).toBe(false);
      expect(isDownloadFailed(status)).toBe(true);
      expect(isDownloadInProgress(status)).toBe(false);
    },
  );
  it.each([
    ModStatus.Downloaded,
    ModStatus.Installed,
    ModStatus.Installing,
    ModStatus.FailedToInstall,
    ModStatus.Removing,
    ModStatus.Removed,
    ModStatus.FailedToRemove,
  ])("retains successful downloads after %s", (status) => {
    expect(isDownloadComplete(status)).toBe(true);
  });
  it.each([ModStatus.Downloading, ModStatus.Extracting, ModStatus.Paused])(
    "keeps %s active",
    (status) => {
      expect(isDownloadInProgress(status)).toBe(true);
      expect(isDownloadComplete(status)).toBe(false);
    },
  );
});
