import { describe, expect, it } from "bun:test";
import type {
  LocalAddonInfo,
  ModDownloadItem,
  ModFileTree,
} from "@/types/mods";
import {
  buildAnalyzedFileTree,
  isRecordedInManifest,
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

  it("asks about a parked file only while its mod is out of the library", () => {
    const result = { addons: [parsedAddon(parked)], errors: [] };
    expect(needsAnalysisReview(result, new Set())).toBe(true);
    expect(needsAnalysisReview(result, new Set(["900001"]))).toBe(false);
  });
});

const parked = {
  fileName: "900001_green.vpk",
  remoteId: "900001",
};

const parsedAddon = (
  addon: Pick<LocalAddonInfo, "fileName"> & Partial<LocalAddonInfo>,
): LocalAddonInfo => ({
  filePath: `/addons/${addon.fileName}`,
  locator: addon.fileName,
  vpkParsed: {
    version: 2,
    treeLength: 0,
    fileDataSectionSize: null,
    archiveMd5SectionSize: null,
    otherMd5SectionSize: null,
    signatureSectionSize: null,
    entries: [],
    manifestSha256: "",
    dirSha256: null,
    fingerprint: {
      filePath: `/addons/${addon.fileName}`,
      fileSize: 1,
      lastModified: null,
      fastHash: "",
      sha256: "",
      contentSignature: "",
      vpkVersion: 2,
      fileCount: 1,
      hasMultiparts: false,
      hasInlineData: false,
      merkleRoot: null,
      merkleLeaves: null,
    },
  },
  ...addon,
});

describe("parked files nothing records", () => {
  const library = new Set<string>();
  it("is a leftover when only the name identifies it and its mod is gone", () => {
    expect(isUnrecordedLeftover(parked, library)).toBe(true);
  });

  it("belongs to its mod while that mod is in the library", () => {
    expect(isUnrecordedLeftover(parked, new Set(["900001"]))).toBe(false);
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
