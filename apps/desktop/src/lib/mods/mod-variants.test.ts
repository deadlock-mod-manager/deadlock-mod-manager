import { describe, expect, it } from "vitest";
import {
  applyDownloadTimeSelection,
  deriveActiveArchiveNames,
  deriveActiveVariantCount,
} from "@/lib/mods/mod-variants";
import type { LocalMod, ModFile } from "@/types/mods";

const file = (
  name: string,
  isSelected: boolean,
  archiveName = "",
): ModFile => ({
  name,
  path: `/addons/${name}`,
  size: 1024,
  is_selected: isSelected,
  archive_name: archiveName,
});

const mod = (values: Partial<LocalMod>): LocalMod =>
  ({
    remoteId: "1",
    name: "Test Mod",
    ...values,
  }) as LocalMod;

const withTree = (files: ModFile[], rest: Partial<LocalMod> = {}): LocalMod =>
  mod({
    installedFileTree: {
      files,
      total_files: files.length,
      has_multiple_files: files.length > 1,
    },
    ...rest,
  });

describe("deriveActiveArchiveNames", () => {
  it("collects the archives of the selected files", () => {
    const names = deriveActiveArchiveNames(
      withTree([
        file("pak01_dir.vpk", true, "red.zip"),
        file("pak02_dir.vpk", true, "blue.zip"),
        file("pak03_dir.vpk", false, "green.zip"),
      ]),
    );

    expect([...names]).toEqual(["red.zip", "blue.zip"]);
  });

  it("falls back to stored archives when the tree has no archive names", () => {
    const names = deriveActiveArchiveNames(
      withTree([file("pak01_dir.vpk", true)], {
        activeVariantArchive: "red.zip,blue.zip",
      }),
    );

    expect([...names]).toEqual(["red.zip", "blue.zip"]);
  });

  it("ignores retained downloads when the tree already lists files", () => {
    const names = deriveActiveArchiveNames(
      withTree([file("pak01_dir.vpk", true)], {
        activeVariantArchive: "",
        selectedDownloads: [
          { name: "red.zip" },
          { name: "blue.zip" },
        ] as LocalMod["selectedDownloads"],
      }),
    );

    expect([...names]).toEqual([]);
  });

  it("uses retained downloads only when no file tree exists", () => {
    const names = deriveActiveArchiveNames(
      mod({
        selectedDownloads: [
          { name: "red.zip" },
        ] as LocalMod["selectedDownloads"],
      }),
    );

    expect([...names]).toEqual(["red.zip"]);
  });

  it("returns nothing once every file is deselected", () => {
    const names = deriveActiveArchiveNames(
      withTree([file("pak01_dir.vpk", false, "red.zip")], {
        activeVariantArchive: "red.zip",
        selectedDownloads: [
          { name: "red.zip" },
        ] as LocalMod["selectedDownloads"],
      }),
    );

    expect([...names]).toEqual([]);
  });
});

describe("deriveActiveVariantCount", () => {
  it("counts distinct active archives", () => {
    expect(
      deriveActiveVariantCount(
        withTree([
          file("pak01_dir.vpk", true, "red.zip"),
          file("pak02_dir.vpk", true, "red.zip"),
          file("pak03_dir.vpk", true, "blue.zip"),
        ]),
      ),
    ).toBe(2);
  });

  it("counts enabled files when archives are unknown", () => {
    expect(
      deriveActiveVariantCount(
        withTree([file("pak01_dir.vpk", true), file("pak02_dir.vpk", true)]),
      ),
    ).toBe(2);
  });

  it("falls back to installed vpks for mods without a file tree", () => {
    expect(
      deriveActiveVariantCount(mod({ installedVpks: ["pak25_dir.vpk"] })),
    ).toBe(1);
  });

  it("returns zero once every file is deselected", () => {
    expect(
      deriveActiveVariantCount(
        withTree([file("pak01_dir.vpk", false, "red.zip")], {
          activeVariantArchive: "red.zip",
          installedVpks: ["pak01_dir.vpk"],
        }),
      ),
    ).toBe(0);
  });

  it("returns zero for mods with no variant information at all", () => {
    expect(deriveActiveVariantCount(mod({ installedVpks: [] }))).toBe(0);
  });
});

const tree = (files: ModFile[]) => ({
  files,
  total_files: files.length,
  has_multiple_files: files.length > 1,
});

const downloads = (...names: string[]) =>
  names.map((name) => ({ name })) as LocalMod["downloads"];

describe("applyDownloadTimeSelection", () => {
  it("keeps only the files of the archive picked during download", () => {
    const result = applyDownloadTimeSelection(
      mod({
        downloads: downloads("red.zip", "blue.zip"),
        selectedDownloads: downloads("red.zip"),
      }),
      tree([
        file("pak01_dir.vpk", true, "red.zip"),
        file("pak02_dir.vpk", true, "blue.zip"),
      ]),
    );

    expect(result?.files.map((f) => f.is_selected)).toEqual([true, false]);
  });

  it("selects every file of the picked archive", () => {
    const result = applyDownloadTimeSelection(
      mod({
        downloads: downloads("red.zip", "blue.zip"),
        selectedDownloads: downloads("red.zip"),
      }),
      tree([
        file("pak01_dir.vpk", true, "red.zip"),
        file("pak02_dir.vpk", true, "red.zip"),
      ]),
    );

    expect(result?.files.map((f) => f.is_selected)).toEqual([true, true]);
  });

  it("falls back to the active variant archive", () => {
    const result = applyDownloadTimeSelection(
      mod({
        downloads: downloads("red.zip", "blue.zip"),
        activeVariantArchive: "blue.zip",
      }),
      tree([
        file("pak01_dir.vpk", true, "red.zip"),
        file("pak02_dir.vpk", true, "blue.zip"),
      ]),
    );

    expect(result?.files.map((f) => f.is_selected)).toEqual([false, true]);
  });

  it("defers to the file selector when the mod only had one download", () => {
    expect(
      applyDownloadTimeSelection(
        mod({
          downloads: downloads("red.zip"),
          selectedDownloads: downloads("red.zip"),
        }),
        tree([
          file("pak01_dir.vpk", true, "red.zip"),
          file("pak02_dir.vpk", true, "red.zip"),
        ]),
      ),
    ).toBeNull();
  });

  it("defers to the file selector when the stored archive is gone", () => {
    expect(
      applyDownloadTimeSelection(
        mod({
          downloads: downloads("red.zip", "blue.zip"),
          selectedDownloads: downloads("green.zip"),
        }),
        tree([
          file("pak01_dir.vpk", true, "red.zip"),
          file("pak02_dir.vpk", true, "blue.zip"),
        ]),
      ),
    ).toBeNull();
  });

  it("defers to the file selector when the files carry no archive names", () => {
    expect(
      applyDownloadTimeSelection(
        mod({
          downloads: downloads("red.zip", "blue.zip"),
          selectedDownloads: downloads("red.zip"),
        }),
        tree([file("pak01_dir.vpk", true), file("pak02_dir.vpk", true)]),
      ),
    ).toBeNull();
  });
});
