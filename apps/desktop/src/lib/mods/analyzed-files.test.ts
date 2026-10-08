import { describe, expect, it } from "bun:test";
import type { ModDownloadItem, ModFileTree } from "@/types/mods";
import { buildAnalyzedFileTree } from "./analyzed-files";

const download = (fileId: string, name: string): ModDownloadItem => ({
  url: `gamebanana-file://42/${fileId}`,
  name,
  size: 100,
  createdAt: null,
  updatedAt: null,
  md5Checksum: null,
});
const downloads = [
  download("100", "base.zip"),
  download("200", "optional.zip"),
];

describe("analyzed addon archive identity", () => {
  it("links renamed game slots to their exact download without selecting other archives", () => {
    const tree = buildAnalyzedFileTree(
      "42",
      [
        {
          fileName: "pak01_dir.vpk",
          size: 50,
          matchInfo: { fileId: "100", certainty: 100, matchType: "sha256" },
        },
        {
          fileName: "pak02_dir.vpk",
          size: 70,
          matchInfo: {
            fileId: "100",
            certainty: 100,
            matchType: "contentSignature",
          },
        },
      ],
      downloads,
    );
    expect(
      tree.files.map((file) => [
        file.name,
        file.archive_name,
        file.is_selected,
      ]),
    ).toEqual([
      ["pak01_dir.vpk", "base.zip", true],
      ["pak02_dir.vpk", "base.zip", true],
    ]);
    expect(tree.total_files).toBe(2);
  });

  it("keeps identity unresolved when the file ID is absent, removed, or belongs to another submission", () => {
    const tree = buildAnalyzedFileTree(
      "43",
      [
        {
          fileName: "pak01_dir.vpk",
          size: 50,
          matchInfo: { fileId: "100", certainty: 100, matchType: "sha256" },
        },
        {
          fileName: "pak02_dir.vpk",
          size: 50,
          matchInfo: { fileId: "300", certainty: 100, matchType: "sha256" },
        },
        { fileName: "pak03_dir.vpk", size: 50 },
      ],
      downloads,
    );
    expect(tree.files.map((file) => file.archive_name)).toEqual(["", "", ""]);
  });

  it("retains original names and cached disabled files when analyzing a managed installation again", () => {
    const previous: ModFileTree = {
      files: [
        {
          name: "base.vpk",
          path: "base.vpk",
          size: 50,
          is_selected: true,
          archive_name: "base.zip",
        },
        {
          name: "optional.vpk",
          path: "optional.vpk",
          size: 100,
          is_selected: false,
          archive_name: "optional.zip",
        },
      ],
      total_files: 2,
      has_multiple_files: true,
    };
    const tree = buildAnalyzedFileTree(
      "42",
      [
        {
          fileName: "pak01_dir.vpk",
          size: 50,
          matchInfo: {
            sourcePath: "files/base.vpk",
            fileId: "100",
            certainty: 100,
            matchType: "sha256",
          },
        },
      ],
      [],
      previous,
    );
    expect(tree).toEqual(previous);
  });
});
