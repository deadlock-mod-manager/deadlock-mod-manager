import { describe, expect, test } from "bun:test";
import type { EntryOverride } from "@/types/generated/EntryOverride";
import type { ImportReport } from "@/types/generated/ImportReport";
import type { ImportSource } from "@/types/generated/ImportSource";
import {
  buildUserPerfConfig,
  fileNameFromPath,
  importAnalyticsSourceKind,
  importOrigin,
  importOverrides,
  looksLikeShareCode,
} from "./save";

const report = (overrides: Partial<ImportReport> = {}): ImportReport => ({
  format: "fullGameinfo",
  suggestedName: null,
  base: null,
  entries: [{ path: ["ConVars", "r_ssao"], value: "0" }],
  resolved: {
    entries: [],
    counts: {
      applies: 0,
      unchanged: 0,
      blocked: 0,
      removed: 0,
      notConvar: 0,
      engineSection: 0,
      excluded: 0,
      denied: 0,
      omitted: 0,
      unsupported: 0,
      overridden: 0,
    },
    cutScore: 0,
    rev: "000000000000",
  },
  ignored: [],
  videoSettings: [],
  stagingId: null,
  variants: [],
  selectedVariant: null,
  presetId: null,
  overrides: [],
  includeEngineSections: false,
  warnings: [],
  ...overrides,
});

describe("looksLikeShareCode", () => {
  test("matches the prefix regardless of case and surrounding space", () => {
    expect(looksLikeShareCode("  DMM-PERF:1:abc\n")).toBe(true);
    expect(looksLikeShareCode('"ConVars" { }')).toBe(false);
  });
});

describe("fileNameFromPath", () => {
  test("handles both separators", () => {
    expect(fileNameFromPath("C:\\Users\\me\\configs\\gameinfo.gi")).toBe(
      "gameinfo.gi",
    );
    expect(fileNameFromPath("/home/me/autoexec.cfg")).toBe("autoexec.cfg");
  });
});

describe("importOrigin", () => {
  test("a pasted share code keeps its preset", () => {
    expect(
      importOrigin(
        { kind: "text", text: "dmm-perf:1:x", file_name: null },
        report({ format: "shareCode", presetId: "optimizationlock" }),
        null,
      ),
    ).toEqual({ kind: "shareCode", presetId: "optimizationlock" });
  });

  test("a file records its name and detected format", () => {
    expect(
      importOrigin(
        { kind: "file", path: "D:\\Downloads\\OptiLock.zip" },
        report({ format: "fullGameinfo" }),
        null,
      ),
    ).toEqual({
      kind: "file",
      fileName: "OptiLock.zip",
      format: "fullGameinfo",
    });
  });

  test("a GameBanana file records the variant that was reviewed", () => {
    expect(
      importOrigin(
        { kind: "gameBanana", mod_id: 616141, file_id: 1428893 },
        report({ selectedVariant: "English/gameinfo.gi" }),
        null,
      ),
    ).toEqual({
      kind: "gamebanana",
      gamebananaId: 616141,
      fileId: 1428893,
      variant: "English/gameinfo.gi",
    });
  });

  test("a staged archive from a mod download names the mod", () => {
    expect(
      importOrigin(
        { kind: "staged", staging_id: "s1", variant_path: "FPS/gameinfo.gi" },
        report(),
        { modId: "690233", modName: "QoL Lite" },
      ),
    ).toEqual({
      kind: "modDownload",
      modId: "690233",
      modName: "QoL Lite",
      variant: "FPS/gameinfo.gi",
    });
  });
});

describe("importAnalyticsSourceKind", () => {
  test("staged sources count as mod downloads only with a mod", () => {
    const staged: ImportSource = {
      kind: "staged",
      staging_id: "s1",
      variant_path: "a",
    };
    expect(
      importAnalyticsSourceKind(staged, { modId: "1", modName: "x" }),
    ).toBe("mod_download");
    expect(importAnalyticsSourceKind(staged, null)).toBe("file");
    expect(importAnalyticsSourceKind({ kind: "currentGameinfo" }, null)).toBe(
      "current_gameinfo",
    );
  });
});

describe("buildUserPerfConfig", () => {
  test("keeps the author's entries, video settings and base build", () => {
    const config = buildUserPerfConfig({
      id: "user:1",
      name: "Pasted config",
      createdAt: "2026-10-08T00:00:00.000Z",
      origin: { kind: "currentGameinfo" },
      report: report({
        base: { build: 6462, date: "2026-04-28", exact: true, distance: 0 },
        videoSettings: [
          {
            key: "r_citadel_shadow_quality",
            value: "0",
            label: null,
            display: null,
          },
        ],
      }),
    });
    expect(config.entries).toEqual([
      { path: ["ConVars", "r_ssao"], value: "0" },
    ]);
    expect(config.baseBuild).toBe(6462);
    expect(config.videoSettings).toHaveLength(1);
  });
});

describe("importOverrides", () => {
  const camera = [
    ["ConVars", "citadel_camera_hero_fov"],
    ["ConVars", "r_aspectratio"],
  ];

  test("keeps the share code's tweaks when camera settings stay on", () => {
    const shared: EntryOverride[] = [
      { path: ["ConVars", "r_ssao"], action: { kind: "set", value: "1" } },
    ];
    expect(importOverrides(shared, camera, true)).toEqual(shared);
  });

  test("omits every camera setting when turned off, replacing tweaks to them", () => {
    const shared: EntryOverride[] = [
      {
        path: ["convars", "CITADEL_CAMERA_HERO_FOV"],
        action: { kind: "set", value: "100" },
      },
    ];
    expect(importOverrides(shared, camera, false)).toEqual([
      {
        path: ["ConVars", "citadel_camera_hero_fov"],
        action: { kind: "omit" },
      },
      { path: ["ConVars", "r_aspectratio"], action: { kind: "omit" } },
    ]);
  });
});
