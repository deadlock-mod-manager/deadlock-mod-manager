import { describe, expect, it } from "bun:test";
import type { ModDto } from "@deadlock-mods/shared";
import { type LocalMod, ModStatus } from "@/types/mods";
import { DEFAULT_CROSSHAIR_CONFIG } from "@deadlock-mods/crosshair/types";
import {
  buildImportedLocalMod,
  crosshairFromConvars,
  crosshairToConvars,
  documentForProfile,
  type InterchangeDocument,
  parseGameBananaReference,
  uniqueName,
  exportInputFromLocalMod,
  fileIdFromDownloadUrl,
  type ImportedMod,
  type InterchangeMod,
  libraryIdForEntry,
  placeholderModDto,
} from "./mod-interchange";

const entry = (overrides: Partial<InterchangeMod> = {}): InterchangeMod => ({
  key: "gamebanana:mod:650634",
  name: "QOL Lock",
  enabled: true,
  order: 0,
  origin: {
    provider: "gamebanana",
    submissionType: "mod",
    submissionId: "650634",
    fileId: 1720039,
    fileName: "qol_313",
  },
  author: "someone",
  description: null,
  category: "Quality of Life/Fixes",
  hero: null,
  thumbnailUrl: "https://images.gamebanana.com/img/ss/mods/x.jpg",
  link: "https://gamebanana.com/mods/650634",
  nsfw: false,
  files: [{ name: "qol_dir.vpk", path: "C:/x/qol_dir.vpk", size: 42 }],
  ...overrides,
});

const result = (overrides: Partial<ImportedMod> = {}) => ({
  key: "gamebanana:mod:650634",
  modId: "650634",
  status: "imported" as const,
  reason: null,
  enabled: true,
  adoptedInPlace: false,
  installedVpks: ["pak01_dir.vpk"],
  fileTree: null,
  installOrder: 3,
  ...overrides,
});

describe("libraryIdForEntry", () => {
  it("maps GameBanana mods and sounds to DMM ids", () => {
    expect(libraryIdForEntry(entry())).toBe("650634");
    expect(
      libraryIdForEntry(
        entry({
          origin: {
            provider: "gamebanana",
            submissionType: "sound",
            submissionId: "12",
          },
        }),
      ),
    ).toBe("snd-12");
    expect(libraryIdForEntry(entry({ origin: { provider: "local" } }))).toBe(
      null,
    );
  });
});

describe("fileIdFromDownloadUrl", () => {
  it("reads both DMM and legacy GameBanana download urls", () => {
    expect(fileIdFromDownloadUrl("gamebanana-file://650634/1720039")).toBe(
      1720039,
    );
    expect(fileIdFromDownloadUrl("https://gamebanana.com/dl/99")).toBe(99);
    expect(fileIdFromDownloadUrl("https://example.com/file.zip")).toBe(null);
  });
});

describe("buildImportedLocalMod", () => {
  it("keeps install state from the import and pins the GameBanana file", () => {
    const built = buildImportedLocalMod(entry(), result(), null);
    expect(built.mod.remoteId).toBe("650634");
    expect(built.mod.images).toEqual([
      "https://images.gamebanana.com/img/ss/mods/x.jpg",
    ]);
    expect(built.additional.status).toBe(ModStatus.Installed);
    expect(built.additional.installOrder).toBe(3);
    expect(built.additional.selectedDownloads?.[0]?.url).toBe(
      "gamebanana-file://650634/1720039",
    );
  });

  it("prefers catalog metadata but never the catalog's identity", () => {
    const catalog = {
      ...placeholderModDto(entry(), "650634"),
      id: "catalog-row",
      name: "QOL Lock (catalog)",
    } satisfies ModDto;
    const built = buildImportedLocalMod(
      entry(),
      result({ enabled: false, installedVpks: [] }),
      catalog,
    );
    expect(built.mod.name).toBe("QOL Lock (catalog)");
    expect(built.mod.id).toBe("650634");
    expect(built.additional.status).toBe(ModStatus.Downloaded);
  });

  it("gives local mods a fallback image and no download record", () => {
    const local = entry({
      key: "local:sha256:ab",
      origin: { provider: "local" },
      thumbnailUrl: null,
      link: null,
    });
    const built = buildImportedLocalMod(
      local,
      result({ modId: "local-0f8fad5b-d9cb-469f-a165-70867728950e" }),
      null,
    );
    expect(built.mod.images[0]).toStartWith("data:image/svg+xml");
    expect(built.mod.remoteUrl).toBe("local://manual");
    expect(built.additional.selectedDownloads).toBeUndefined();
  });
});

describe("exportInputFromLocalMod", () => {
  it("skips data-url images and recovers the file id", () => {
    const mod = {
      ...placeholderModDto(entry(), "650634"),
      images: ["data:image/png;base64,xx", "https://img/x.png"],
      status: ModStatus.Installed,
      selectedDownloads: [
        {
          url: "gamebanana-file://650634/5",
          size: 1,
          name: "qol.zip",
          description: null,
          createdAt: null,
          updatedAt: null,
          md5Checksum: null,
        },
      ],
    } satisfies LocalMod;
    const input = exportInputFromLocalMod(mod, true, 2);
    expect(input.thumbnailUrl).toBe("https://img/x.png");
    expect(input.fileId).toBe(5);
    expect(input.fileName).toBe("qol.zip");
    expect(input.order).toBe(2);
  });
});

describe("profiles, crosshairs and references", () => {
  const doc = (): InterchangeDocument => ({
    format: "deadlock-mod-interchange",
    version: 1,
    createdAt: null,
    source: { manager: "grimoire" },
    contents: ["mods", "profiles"],
    mods: [
      entry(),
      entry({ key: "local:b", name: "B", origin: { provider: "local" } }),
    ],
    profiles: [
      {
        key: "p",
        name: "Ranked",
        active: true,
        description: null,
        mods: [
          { modKey: "local:b", enabled: false, order: 0 },
          { modKey: "gamebanana:mod:650634", enabled: true, order: 1 },
        ],
        crosshairKey: null,
        autoexec: null,
      },
    ],
    crosshairs: [],
    warnings: [],
  });

  it("scopes a document to one profile's mods, order and states", () => {
    const scoped = documentForProfile(doc(), doc().profiles[0]);
    expect(scoped.mods.map((m) => [m.key, m.enabled, m.order])).toEqual([
      ["local:b", false, 0],
      ["gamebanana:mod:650634", true, 1],
    ]);
    expect(scoped.profiles).toEqual([]);
  });

  it("never reuses a profile name", () => {
    expect(uniqueName("Ranked", ["Default Profile"])).toBe("Ranked");
    expect(uniqueName("Ranked", ["ranked", "Ranked (2)"])).toBe("Ranked (3)");
    expect(uniqueName("  ", [])).toBe("Imported profile");
  });

  it("parses GameBanana links and ids", () => {
    expect(parseGameBananaReference("https://gamebanana.com/mods/123")).toBe(
      "123",
    );
    expect(parseGameBananaReference("gamebanana.com/sounds/77?x")).toBe(
      "snd-77",
    );
    expect(parseGameBananaReference(" 456 ")).toBe("456");
    expect(parseGameBananaReference("https://example.com/mods/1")).toBe(null);
  });

  it("resolves library ids through the import ledger", () => {
    expect(
      libraryIdForEntry(
        entry({ key: "local:b", origin: { provider: "local" } }),
        {
          "local:b": "999",
        },
      ),
    ).toBe("999");
  });

  it("round-trips crosshairs through game convars without touching defaults", () => {
    const config = crosshairFromConvars({
      citadel_crosshair_pip_gap: "4",
      citadel_crosshair_color_r: "10",
      citadel_crosshair_pip_outline_border: "2",
      citadel_crosshair_dot_size: "8",
    });
    expect(config?.gap).toBe(4);
    expect(config?.color.r).toBe(10);
    expect(config?.pipBorder).toBe(true);
    expect(DEFAULT_CROSSHAIR_CONFIG.color.r).toBe(255);
    expect(crosshairFromConvars(crosshairToConvars(config!))).toEqual(config);
    expect(crosshairFromConvars({ something_else: "1" })).toBe(null);
  });
});
