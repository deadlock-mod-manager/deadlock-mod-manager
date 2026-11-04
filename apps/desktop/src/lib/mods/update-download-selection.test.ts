import { describe, expect, it } from "bun:test";
import type { ModDownloadItem } from "@/types/mods";
import { selectUpdateDownloads } from "./update-download-selection";
const file = (name: string, isArchived = false): ModDownloadItem => ({
  name,
  isArchived,
  url: `https://gamebanana.com/dl/${name}`,
  size: 10,
  md5Checksum: null,
  createdAt: null,
  updatedAt: null,
});
describe("update file selection", () => {
  it("requires a choice for unmatched variants", () => {
    expect(
      selectUpdateDownloads([file("red.zip"), file("blue.zip")], {
        selectedDownloads: [file("old.zip")],
      }),
    ).toEqual([]);
  });
  it("matches a reupload without selecting the old archive too", () => {
    const old = file("pack_a1b2c.zip", true),
      next = file("pack_d3e4f.zip");
    expect(
      selectUpdateDownloads([old, next, file("other.zip")], {
        selectedDownloads: [old],
      }),
    ).toEqual([next]);
  });
  it("keeps an installed archived companion when another file updates", () => {
    const companion = file("extra.zip", true),
      next = file("pack_d3e4f.zip");
    expect(
      selectUpdateDownloads([next, companion], {
        selectedDownloads: [file("pack_a1b2c.zip"), companion],
      }),
    ).toEqual([next, companion]);
  });
  it("does not silently drop an unmatched companion", () => {
    const next = file("pack.zip");
    expect(
      selectUpdateDownloads([next], {
        selectedDownloads: [next, file("missing.zip")],
      }),
    ).toEqual([]);
  });
  it("does not choose between duplicate base names", () => {
    expect(
      selectUpdateDownloads([file("pack_a1b2c.zip"), file("pack_d3e4f.zip")], {
        selectedDownloads: [file("pack_f1a2b.zip")],
      }),
    ).toEqual([]);
  });
});
