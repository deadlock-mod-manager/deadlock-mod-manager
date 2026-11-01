import { describe, expect, it, mock } from "bun:test";
import type { ModDto, ProfileModDownload } from "@deadlock-mods/shared";
import { ModStatus, type ModDownloadItem } from "@/types/mods";
import type { OrderedImportedMod } from "./types";

const logger = {
  withMetadata() {
    return this;
  },
  warn() {},
};
mock.module("@/lib/logger", () => ({ default: logger }));

let catalog: ModDownloadItem[] = [];
mock.module("@/lib/api-client", () => ({
  getMod: async () => {
    throw new Error("not used");
  },
  getModDownloads: async () => ({ downloads: catalog, count: catalog.length }),
}));

// Bun evaluates static imports before module mocks; load these after them.
const { prepareProfileImportMods } = await import("./import-profile-prep");
const { resolveProfileImportDownloadFiles } =
  await import("./import-downloads");
const { serializeEnabledProfileMods } =
  await import("./serialize-profile-mods");

const download = (name: string): ModDownloadItem => ({
  url: `https://files.example/${name}`,
  size: 100,
  name,
  description: null,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-01T00:00:00Z"),
  md5Checksum: `md5-${name}`,
});

const BASE = download("charlie-base.zip");
const EFFECTS = download("charlie-effects.zip");
const EXTRA = download("charlie-extra.zip");

const pick = (item: Pick<ModDownloadItem, "name" | "url">) =>
  ({
    remoteId: "42",
    file: item.name,
    url: item.url,
    size: 100,
  }) satisfies ProfileModDownload;

const modData = { remoteId: "42", name: "Charlie", isMap: false } as ModDto;

const prepare = async (importedMod: Partial<OrderedImportedMod>) => {
  const { preparedMods, failed } = await prepareProfileImportMods([
    {
      importedMod: { remoteId: "42", submissionType: "mod", ...importedMod },
      modData,
    },
  ]);
  expect(failed).toEqual([]);
  const [prepared] = preparedMods;
  // What the import stores must be exactly what it fetches.
  expect(
    prepared.downloads.selectedDownloads.map(({ name, url }) => ({
      name,
      url,
    })),
  ).toEqual(
    prepared.profileImportMod.downloadFiles.map(({ name, url }) => ({
      name,
      url,
    })),
  );
  return prepared;
};

describe("prepareProfileImportMods", () => {
  it("keeps the catalog entry of a non-first archive the share picked", async () => {
    catalog = [BASE, EFFECTS, EXTRA];

    const prepared = await prepare({ selectedDownloads: [pick(EFFECTS)] });

    expect(prepared.downloads).toEqual({
      downloads: [BASE, EFFECTS, EXTRA],
      selectedDownloads: [EFFECTS],
    });
  });

  it("keeps every archive of a multi-archive pick", async () => {
    catalog = [BASE, EFFECTS, EXTRA];

    const prepared = await prepare({
      selectedDownloads: [pick(EXTRA), pick(EFFECTS)],
    });

    expect(prepared.downloads.selectedDownloads).toEqual([EXTRA, EFFECTS]);
  });

  it("keeps a legacy single-download pick", async () => {
    catalog = [BASE, EFFECTS];

    const prepared = await prepare({ selectedDownload: pick(EFFECTS) });

    expect(prepared.downloads.selectedDownloads).toEqual([EFFECTS]);
  });

  it("records every archive when the share picked none", async () => {
    catalog = [BASE, EFFECTS];

    const prepared = await prepare({});

    expect(prepared.downloads.selectedDownloads).toEqual([BASE, EFFECTS]);
  });

  it("records the live entry for a pick the author renamed", async () => {
    catalog = [download("charlie-effects-v2.zip")];

    const prepared = await prepare({ selectedDownloads: [pick(EFFECTS)] });

    expect(prepared.downloads.selectedDownloads).toEqual(catalog);
  });

  it("records the share's file, without catalog metadata, when the catalog no longer lists it", async () => {
    catalog = [BASE, EXTRA];

    const prepared = await prepare({ selectedDownloads: [pick(EFFECTS)] });

    expect(prepared.downloads.selectedDownloads).toEqual([
      {
        url: EFFECTS.url,
        name: EFFECTS.name,
        size: 100,
        description: null,
        createdAt: null,
        updatedAt: null,
        md5Checksum: null,
      },
    ]);
  });
});

describe("re-sharing an imported mod", () => {
  it("passes on the archive the import fetched", async () => {
    catalog = [BASE, EFFECTS, EXTRA];
    const prepared = await prepare({ selectedDownloads: [pick(EFFECTS)] });

    const shared = serializeEnabledProfileMods(
      {
        enabledMods: {
          "42": { remoteId: "42", enabled: true, lastModified: new Date(0) },
        },
      },
      [{ ...modData, ...prepared.downloads, status: ModStatus.Installed }],
    );
    const reimported = resolveProfileImportDownloadFiles({
      availableDownloads: catalog,
      selectedDownloads: shared.mods[0].selectedDownloads,
    });

    expect(reimported.downloadFiles.map((file) => file.name)).toEqual([
      EFFECTS.name,
    ]);
  });
});
