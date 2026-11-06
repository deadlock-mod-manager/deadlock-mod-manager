import { describe, expect, it } from "bun:test";
import {
  type ModDownloadItem,
  type ModFile,
  type ModFileTree,
  ModStatus,
} from "@/types/mods";
import type { ModGroup, VpkManifest } from "@/types/profiles";
import { groupRandomizerPools } from "./group-randomizer";

const mod = (
  remoteId: string,
  status: ModStatus,
  usesCriticalPaths = false,
) => ({ remoteId, status, usesCriticalPaths, isMap: false });

const group = (modIds: string[], randomize = true): ModGroup => ({
  id: modIds.join(),
  name: modIds.join(),
  modIds,
  collapsed: false,
  randomize,
});

const ids = (mods: { remoteId: string }[]) => mods.map((m) => m.remoteId);

const file = (path: string, archive_name: string): ModFile => ({
  name: path,
  path,
  size: 1,
  is_selected: true,
  archive_name,
});

const download = (name: string): ModDownloadItem => ({
  url: `https://example.com/${name}`,
  name,
  size: 1,
  createdAt: null,
  updatedAt: null,
  md5Checksum: null,
});

describe("groupRandomizerPools", () => {
  it("rolls only randomizable members but takes off every installed one", () => {
    const mods = [
      mod("a", ModStatus.Installed),
      mod("b", ModStatus.Downloaded),
      mod("c", ModStatus.Installed, true),
      mod("d", ModStatus.Downloading),
    ];
    const [pool] = groupRandomizerPools(
      [group(["a", "b", "c", "d", "gone"])],
      mods,
    );
    expect(ids(pool.pool)).toEqual(["a", "b"]);
    expect(ids(pool.active)).toEqual(["a", "c"]);
  });

  it("rolls variant mods only when the installer would not ask for a pick", () => {
    const variants: ModFileTree = {
      files: [file("a.vpk", "red.zip"), file("b.vpk", "red.zip")],
      total_files: 2,
      has_multiple_files: true,
    };
    const unconfigured = {
      ...mod("unconfigured", ModStatus.Downloaded),
      installedFileTree: variants,
    };
    const chosenAtDownload = {
      ...unconfigured,
      remoteId: "chosen",
      downloads: [download("red.zip"), download("blue.zip")],
      selectedDownloads: [download("red.zip")],
    };
    const disabledVariant = { ...unconfigured, remoteId: "disabled" };
    const manifest: VpkManifest = {
      version: 1,
      mods: {
        disabled: {
          enabled: false,
          shard: 0,
          currentVpks: [],
          disabledVpks: ["pak01_dir.vpk"],
          originalVpkNames: ["a.vpk"],
        },
      },
    };
    const mods = [
      mod("plain", ModStatus.Downloaded),
      { ...mod("map", ModStatus.Downloaded), isMap: true },
      unconfigured,
      chosenAtDownload,
      disabledVariant,
    ];
    const groups = [group(mods.map((m) => m.remoteId))];

    expect(ids(groupRandomizerPools(groups, mods)[0].pool)).toEqual([
      "plain",
      "chosen",
    ]);
    expect(ids(groupRandomizerPools(groups, mods, manifest)[0].pool)).toEqual([
      "plain",
      "chosen",
      "disabled",
    ]);
  });

  it("skips groups that are not randomized or have nothing to choose from", () => {
    const mods = [
      mod("a", ModStatus.Downloaded),
      mod("b", ModStatus.Downloaded),
      mod("c", ModStatus.Downloaded),
      mod("d", ModStatus.Downloaded, true),
    ];
    expect(
      groupRandomizerPools([group(["a", "b"], false), group(["c", "d"])], mods),
    ).toEqual([]);
  });
});
