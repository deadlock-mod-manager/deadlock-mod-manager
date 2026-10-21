import { describe, expect, it } from "bun:test";
import {
  getBatchUpdateFailure,
  remainingUpdateTargets,
  resolveUpdateFailures,
} from "./batch-update-failures";
const jacket = { remoteId: "636266", name: "Jacket (Billy Overhaul)" };
const baggy = { remoteId: "658671", name: "Baggy Billy" };
const duplicate = {
  kind: "duplicateVpkOwnership",
  message: "Duplicate ownership",
  conflictingMods: [jacket.remoteId, baggy.remoteId],
  path: "addons/profile_other/pak19_dir.vpk",
  profileFolder: "profile_other",
};

describe("batch update failures", () => {
  it("resolves mods outside the update selection from the reported profile", () => {
    const failure = getBatchUpdateFailure(
      duplicate,
      [{ ...jacket, name: "Active profile name" }],
      [
        {
          folderName: "profile_other",
          name: "Other profile",
          mods: [jacket, baggy],
        },
      ],
    );
    expect(failure.ownership).toEqual({
      path: duplicate.path,
      profileName: "Other profile",
      mods: [
        { id: jacket.remoteId, name: jacket.name },
        { id: baggy.remoteId, name: baggy.name },
      ],
    });
  });
  it("keeps IDs and folder names when profile metadata is absent", () => {
    const failure = getBatchUpdateFailure(duplicate, [jacket], []);
    expect(failure.ownership?.mods[1]).toEqual({
      id: baggy.remoteId,
      name: baggy.remoteId,
    });
    expect(failure.ownership?.profileName).toBe("profile_other");
  });
  it("recognizes the default profile", () => {
    expect(
      getBatchUpdateFailure(
        { ...duplicate, profileFolder: "" },
        [],
        [{ folderName: null, name: "Default Profile", mods: [jacket, baggy] }],
      ).ownership?.profileName,
    ).toBe("Default Profile");
  });
  it("preserves ordinary reasons and handles malformed ownership data", () => {
    expect(
      getBatchUpdateFailure(
        { kind: "backupCreationFailed", message: "Disk full" },
        [],
        [],
      ),
    ).toEqual({ kind: "backupCreationFailed", message: "Disk full" });
    expect(
      getBatchUpdateFailure(
        { ...duplicate, conflictingMods: "invalid" },
        [],
        [],
      ).ownership,
    ).toBeUndefined();
    expect(
      getBatchUpdateFailure("Network request failed", [], []).message,
    ).toBe("Network request failed");
  });
  it("retains each mod's name and reason", () => {
    expect(
      resolveUpdateFailures(
        [
          [baggy.remoteId, "Download unavailable"],
          ["missing", "File locked"],
        ],
        [baggy],
      ),
    ).toEqual([
      { id: baggy.remoteId, name: baggy.name, reason: "Download unavailable" },
      { id: "missing", name: "missing", reason: "File locked" },
    ]);
  });
  it("retries only failed mods across attempts with their original selections", () => {
    const targets = [
      { mod: jacket, selectedDownloads: ["jacket.rar"] },
      { mod: baggy, selectedDownloads: ["baggy.rar"] },
    ];
    const failed: [string, string][] = [[baggy.remoteId, "Unavailable"]];
    const retry = remainingUpdateTargets(targets, { failed });
    expect(retry).toEqual([targets[1]]);
    expect(remainingUpdateTargets(retry)).toEqual(retry);
    expect(remainingUpdateTargets(retry, { failed })).toEqual(retry);
    expect(remainingUpdateTargets(retry, { failed: [] })).toEqual([]);
  });
});
