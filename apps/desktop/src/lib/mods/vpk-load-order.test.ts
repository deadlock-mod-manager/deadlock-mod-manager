import { describe, expect, it } from "bun:test";
import {
  insertFilesInAuthorOrder,
  reorderFiles,
} from "@/lib/mods/vpk-load-order";
import type { ModFile } from "@/types/mods";

const file = (
  name: string,
  archiveName: string,
  isSelected = true,
): ModFile => ({
  name,
  path: `${archiveName}/${name}`,
  size: 0,
  is_selected: isSelected,
  archive_name: archiveName,
});

const names = (files: ModFile[]) => files.map((f) => f.name);

describe("insertFilesInAuthorOrder", () => {
  it("places a new archive's files where the author lists that archive", () => {
    const files = [
      file("glow.vpk", "glow.zip"),
      file("green.vpk", "green.zip"),
    ];
    const added = [file("deep_sea.vpk", "pack.zip")];

    expect(
      names(
        insertFilesInAuthorOrder(files, added, [
          "glow.zip",
          "pack.zip",
          "green.zip",
        ]),
      ),
    ).toEqual(["glow.vpk", "deep_sea.vpk", "green.vpk"]);
  });
});

describe("reorderFiles", () => {
  it("reorders the named files within their slots and leaves the rest", () => {
    const files = [
      file("a.vpk", "x.zip"),
      file("off.vpk", "x.zip", false),
      file("b.vpk", "x.zip"),
      file("c.vpk", "x.zip"),
    ];

    expect(names(reorderFiles(files, ["c.vpk", "a.vpk", "b.vpk"]))).toEqual([
      "c.vpk",
      "off.vpk",
      "a.vpk",
      "b.vpk",
    ]);
  });
});
