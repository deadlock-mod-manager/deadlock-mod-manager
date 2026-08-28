import { describe, expect, it } from "bun:test";
import { resolveDroppedModSource } from "./dropped-file-source";
import {
  MAX_BROWSER_MOD_FILE_BYTES,
  detectSource,
  exceedsBrowserModFileLimit,
} from "./file-utils";

const createFile = (name: string) => new File(["test"], name);

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
    const initialFile = createFile("mod.vpk");
    Object.defineProperty(initialFile, "path", {
      configurable: true,
      value: "/tmp/mod.vpk",
    });

    const detectedSource = await resolveDroppedModSource([initialFile], {
      getFilesFromItems: async () => {
        itemReads += 1;
        return [createFile("fallback.zip")];
      },
      getPathsFromUriList: async () => {
        uriReads += 1;
        return ["/tmp/fallback.7z"];
      },
    });

    expect(detectedSource).toEqual({
      kind: "vpk",
      source: {
        type: "nativePath",
        path: "/tmp/mod.vpk",
        fileName: "mod.vpk",
      },
    });
    expect(itemReads).toBe(0);
    expect(uriReads).toBe(0);
  });

  it("prefers a native uri-list path over a browser File fallback", async () => {
    const detectedSource = await resolveDroppedModSource(
      [createFile("large.vpk")],
      {
        getPathsFromUriList: async () => ["/tmp/large.vpk"],
      },
    );

    expect(detectedSource?.source.type).toBe("nativePath");
  });

  it("falls back to DataTransfer items when the initial dropped files are unusable", async () => {
    const itemFile = createFile("dropped.vpk");
    const detectedSource = await resolveDroppedModSource(
      [createFile("invalid.txt")],
      {
        getFilesFromItems: async () => [itemFile],
      },
    );

    expect(detectedSource).toEqual({
      kind: "vpk",
      source: { type: "browserFile", file: itemFile },
    });
  });

  it("falls back to native uri-list paths when files and items are unusable", async () => {
    const detectedSource = await resolveDroppedModSource(
      [createFile("invalid.txt")],
      {
        getFilesFromItems: async () => [createFile("still-invalid.txt")],
        getPathsFromUriList: async () => ["/tmp/from-uri.vpk"],
      },
    );

    expect(detectedSource).toEqual({
      kind: "vpk",
      source: {
        type: "nativePath",
        path: "/tmp/from-uri.vpk",
        fileName: "from-uri.vpk",
      },
    });
  });

  it("keeps an absolute webkitRelativePath as a native path", () => {
    const detectedSource = detectSource([
      createPathOnlyFile("/home/gabriel/Downloads/a.vpk"),
    ]);

    expect(detectedSource).toEqual({
      kind: "vpk",
      source: {
        type: "nativePath",
        path: "/home/gabriel/Downloads/a.vpk",
        fileName: "a.vpk",
      },
    });
  });

  it("detects a vpk when multiple files are dropped alongside unsupported files", () => {
    const vpkFile = createFile("hero_skin.vpk");
    const detectedSource = detectSource([
      createFile("readme.txt"),
      vpkFile,
      createFile("notes.pdf"),
    ]);

    expect(detectedSource).toEqual({
      kind: "vpk",
      source: { type: "browserFile", file: vpkFile },
    });
  });

  it("detects an archive when multiple files are dropped alongside unsupported files", () => {
    const archiveFile = createFile("skin_pack.zip");
    const detectedSource = detectSource([
      createFile("readme.txt"),
      archiveFile,
    ]);

    expect(detectedSource).toEqual({
      kind: "archive",
      source: { type: "browserFile", file: archiveFile },
    });
  });

  it("prefers vpk over archive when both are present in a multi-file drop", () => {
    const detectedSource = detectSource([
      createFile("backup.zip"),
      createFile("hero_skin.vpk"),
    ]);

    expect(detectedSource?.kind).toBe("vpk");
  });

  it("keeps a 200 MiB native input as a path without reading its payload", () => {
    const inputSize = 200 * 1024 * 1024;
    const file = new File([], "large.vpk");
    let payloadReads = 0;
    Object.defineProperty(file, "path", {
      configurable: true,
      value: "/tmp/large.vpk",
    });
    Object.defineProperty(file, "size", {
      configurable: true,
      value: inputSize,
    });
    Object.defineProperty(file, "arrayBuffer", {
      configurable: true,
      value: async () => {
        payloadReads += 1;
        throw new Error("native payload should not enter the renderer");
      },
    });

    const startedAt = performance.now();
    const detectedSource = detectSource([file]);
    const elapsedMilliseconds = performance.now() - startedAt;

    expect(file.size).toBe(inputSize);
    expect(detectedSource).toEqual({
      kind: "vpk",
      source: {
        type: "nativePath",
        path: "/tmp/large.vpk",
        fileName: "large.vpk",
      },
    });
    expect(payloadReads).toBe(0);
    expect(elapsedMilliseconds).toBeLessThan(250);
  });

  it("applies the explicit limit only to browser-originated files", () => {
    const file = new File([], "large.vpk");
    Object.defineProperty(file, "size", {
      configurable: true,
      value: MAX_BROWSER_MOD_FILE_BYTES + 1,
    });

    const detectedSource = detectSource([file]);

    expect(detectedSource).not.toBeNull();
    if (detectedSource) {
      expect(exceedsBrowserModFileLimit(detectedSource)).toBe(true);
    }
  });
});
