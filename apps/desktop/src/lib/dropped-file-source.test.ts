import { describe, expect, it } from "bun:test";
import { resolveDroppedModSource } from "./dropped-file-source";
import { type DetectedSource, detectSource, sourceFiles } from "./file-utils";

const createFile = (name: string) => new File(["test"], name);

const fileNames = (source: DetectedSource | null) =>
  source ? sourceFiles(source).map((file) => file.name) : [];

const createPathOnlyFile = (path: string) => {
  const file = new File(["test"], "");
  Object.defineProperty(file, "webkitRelativePath", {
    configurable: true,
    value: path,
  });
  return file;
};

describe("resolveDroppedModSource", () => {
  it("uses the initial dropped files when they already contain a supported file", async () => {
    let itemReads = 0;
    let uriReads = 0;

    const detectedSource = await resolveDroppedModSource(
      [createFile("mod.vpk")],
      {
        getFilesFromItems: async () => {
          itemReads += 1;
          return [createFile("fallback.zip")];
        },
        getFilesFromUriList: async () => {
          uriReads += 1;
          return [createFile("fallback.7z")];
        },
      },
    );

    expect(detectedSource?.kind).toBe("vpk");
    expect(fileNames(detectedSource)).toEqual(["mod.vpk"]);
    expect(itemReads).toBe(0);
    expect(uriReads).toBe(0);
  });

  it("falls back to DataTransfer items when the initial dropped files are unusable", async () => {
    const detectedSource = await resolveDroppedModSource(
      [createFile("invalid.txt")],
      {
        getFilesFromItems: async () => [createFile("dropped.vpk")],
      },
    );

    expect(detectedSource?.kind).toBe("vpk");
    expect(fileNames(detectedSource)).toEqual(["dropped.vpk"]);
  });

  it("falls back to uri-list files when both initial files and items are unusable", async () => {
    const detectedSource = await resolveDroppedModSource(
      [createFile("invalid.txt")],
      {
        getFilesFromItems: async () => [createFile("still-invalid.txt")],
        getFilesFromUriList: async () => [createFile("from-uri.vpk")],
      },
    );

    expect(detectedSource?.kind).toBe("vpk");
    expect(fileNames(detectedSource)).toEqual(["from-uri.vpk"]);
  });

  it("detects supported files from webkitRelativePath when File.name is empty", () => {
    const detectedSource = detectSource([
      createPathOnlyFile("/home/gabriel/Downloads/a.vpk"),
    ]);

    expect(detectedSource?.kind).toBe("vpk");
  });

  it("detects a vpk when multiple files are dropped alongside unsupported files", () => {
    const detectedSource = detectSource([
      createFile("readme.txt"),
      createFile("hero_skin.vpk"),
      createFile("notes.pdf"),
    ]);

    expect(detectedSource?.kind).toBe("vpk");
    expect(fileNames(detectedSource)).toEqual(["hero_skin.vpk"]);
  });

  it("detects an archive when multiple files are dropped alongside unsupported files", () => {
    const detectedSource = detectSource([
      createFile("readme.txt"),
      createFile("skin_pack.zip"),
    ]);

    expect(detectedSource?.kind).toBe("archive");
    expect(fileNames(detectedSource)).toEqual(["skin_pack.zip"]);
  });

  it("keeps several vpks as one source, once per file name", () => {
    const detectedSource = detectSource([
      createFile("skin_base.vpk"),
      createFile("readme.txt"),
      createFile("skin_hair.vpk"),
      createFile("SKIN_BASE.vpk"),
      createFile("backup.zip"),
    ]);

    expect(detectedSource?.kind).toBe("vpks");
    expect(fileNames(detectedSource)).toEqual([
      "skin_base.vpk",
      "skin_hair.vpk",
    ]);
  });

  it("prefers vpk over archive when both are present in a multi-file drop", () => {
    const detectedSource = detectSource([
      createFile("backup.zip"),
      createFile("hero_skin.vpk"),
    ]);

    expect(detectedSource?.kind).toBe("vpk");
    expect(fileNames(detectedSource)).toEqual(["hero_skin.vpk"]);
  });
});
