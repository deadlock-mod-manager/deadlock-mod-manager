import { describe, expect, it } from "bun:test";
import { modFor } from "@/lib/store/slices/profiles.test-support";
import type { LocalMod, ModDownloadItem, ModFile } from "@/types/mods";
import { serializeEnabledProfileMods } from "./serialize-profile-mods";

const download = (name: string): ModDownloadItem => ({
  url: `https://files.example/${name}`,
  size: 100,
  name,
  description: null,
  createdAt: null,
  updatedAt: null,
  md5Checksum: null,
});

const BASE = download("charlie-base.zip");
const EFFECTS = download("charlie-effects.zip");
const EXTRA = download("charlie-extra.zip");

const file = (
  name: string,
  archiveName: string,
  isSelected = true,
): ModFile => ({
  name,
  path: archiveName ? `${archiveName}/${name}` : name,
  size: 10,
  is_selected: isSelected,
  archive_name: archiveName,
});

const charlie = (overrides: Partial<LocalMod>): LocalMod => ({
  ...modFor("42"),
  ...overrides,
});

const sharedPicks = (mod: LocalMod) =>
  serializeEnabledProfileMods(
    {
      enabledMods: {
        [mod.remoteId]: {
          remoteId: mod.remoteId,
          enabled: true,
          lastModified: new Date(0),
        },
      },
    },
    [mod],
  ).mods[0].selectedDownloads?.map((selected) => selected.file);

const tree = (...files: ModFile[]) => ({
  files,
  total_files: files.length,
  has_multiple_files: files.length > 1,
});

describe("serializeEnabledProfileMods picks", () => {
  it("passes on a recorded pick before the download list has loaded", () => {
    expect(sharedPicks(charlie({ selectedDownloads: [EFFECTS] }))).toEqual([
      EFFECTS.name,
    ]);
  });

  it("prefers the recorded pick over the file tree", () => {
    const mod = charlie({
      downloads: [BASE, EFFECTS, EXTRA],
      selectedDownloads: [EXTRA],
      installedFileTree: tree(file("effects.vpk", EFFECTS.name)),
    });

    expect(sharedPicks(mod)).toEqual([EXTRA.name]);
  });

  it("reads an unrecorded pick from the archives its selected files came from", () => {
    const mod = charlie({
      downloads: [BASE, EFFECTS, EXTRA],
      installedFileTree: tree(
        file("base.vpk", BASE.name, false),
        file("effects_a.vpk", EFFECTS.name),
        file("effects_b.vpk", EFFECTS.name),
        file("extra.vpk", EXTRA.name),
      ),
    });

    expect(sharedPicks(mod)).toEqual([EFFECTS.name, EXTRA.name]);
  });

  it("falls back to the first download when a selected file names no archive", () => {
    const mod = charlie({
      downloads: [BASE, EFFECTS],
      installedFileTree: tree(
        file("effects.vpk", EFFECTS.name),
        file("loose.vpk", ""),
      ),
    });

    expect(sharedPicks(mod)).toEqual([BASE.name]);
  });

  it("falls back to the first download when an archive isn't in the catalog", () => {
    const mod = charlie({
      downloads: [BASE, EFFECTS],
      installedFileTree: tree(
        file("effects.vpk", EFFECTS.name),
        file("gone.vpk", "charlie-gone.zip"),
      ),
    });

    expect(sharedPicks(mod)).toEqual([BASE.name]);
  });

  it("falls back to the first download when the catalog lists the archive twice", () => {
    const mod = charlie({
      downloads: [
        BASE,
        EFFECTS,
        { ...EFFECTS, url: "https://files.example/2" },
      ],
      installedFileTree: tree(file("effects.vpk", EFFECTS.name)),
    });

    expect(sharedPicks(mod)).toEqual([BASE.name]);
  });

  it("falls back to the first download when no file is marked selected", () => {
    const mod = charlie({
      downloads: [BASE, EFFECTS],
      installedFileTree: tree(file("effects.vpk", EFFECTS.name, false)),
    });

    expect(sharedPicks(mod)).toEqual([BASE.name]);
  });
});
