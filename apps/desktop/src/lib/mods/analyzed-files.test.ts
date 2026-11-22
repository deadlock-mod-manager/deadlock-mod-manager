import { describe, expect, it } from "bun:test";
import type { ModDownloadItem, ModFileTree } from "@/types/mods";
import {
  buildAnalyzedFileTree,
  isRecordedInManifest,
  isIgnoredByGame,
  isUnrecordedLeftover,
  needsAnalysisReview,
} from "./analyzed-files";

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

describe("analysis review", () => {
  it("asks for review when files failed to parse even if every addon was identified", () => {
    expect(
      needsAnalysisReview(
        {
          addons: [],
          errors: ["Failed to parse pak03_dir.vpk: invalid header"],
        },
        new Set(),
      ),
    ).toBe(true);
  });
});

const parked = {
  fileName: "900001_green.vpk",
  remoteId: "900001",
};

describe("parked files nothing records", () => {
  const library = new Set<string>();
  it("is a leftover when only the name identifies it and its mod is gone", () => {
    expect(isUnrecordedLeftover(parked, library)).toBe(true);
  });

  it("is never a leftover once DMM records it or the hash service knows it", () => {
    expect(
      isUnrecordedLeftover({ ...parked, manifestModId: "900001" }, library),
    ).toBe(false);
    expect(
      isUnrecordedLeftover(
        {
          ...parked,
          matchInfo: { certainty: 100, matchType: "sha256" },
        },
        library,
      ),
    ).toBe(false);
  });

  it("ignores files identified any other way", () => {
    // An enabled file the manifest assigns to a catalog mod.
    expect(
      isUnrecordedLeftover(
        { fileName: "pak01_dir.vpk", remoteId: "900001" },
        library,
      ),
    ).toBe(false);
    expect(isUnrecordedLeftover({ fileName: "pak04_dir.vpk" }, library)).toBe(
      false,
    );
  });
});

describe("files the game doesn't load", () => {
  it("leaves a file the manifest records to DMM even when it hashes to another mod", () => {
    // A disabled local mod's file whose contents match a catalog mod.
    expect(
      isIgnoredByGame({
        fileName: "local-1_pak05_dir.vpk",
        remoteId: "900002",
        manifestModId: "local-1",
        hasEnabledVpkName: false,
      }),
    ).toBe(false);
  });
});

describe("addons the profile manifest already records", () => {
  it("skips registration only when the manifest assigns every file to that mod", () => {
    expect(
      isRecordedInManifest("42", [
        { manifestModId: "42" },
        { manifestModId: "42" },
      ]),
    ).toBe(true);
  });

  it("registers the whole group when a file the manifest doesn't know hashes to the same mod", () => {
    expect(isRecordedInManifest("42", [{ manifestModId: "42" }, {}])).toBe(
      false,
    );
  });

  it("registers a hash match that replaces the manifest's local placeholder", () => {
    expect(
      isRecordedInManifest("42", [{ manifestModId: "local-unidentified" }]),
    ).toBe(false);
  });

  it("never treats two missing owners as a match", () => {
    expect(isRecordedInManifest("42", [{}])).toBe(false);
    expect(isRecordedInManifest("42", [])).toBe(false);
  });
});
