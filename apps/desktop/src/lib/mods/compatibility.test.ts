import { describe, expect, test } from "bun:test";
import type { LocalizationOverlayAnalysis } from "@/components/my-mods/localization-conflict-review";
import { compatibilityResolutions, groupAssetRepairs } from "./compatibility";

const analysis: LocalizationOverlayAnalysis = {
  baselines: [],
  reviewFingerprint: "test",
  inputWarnings: [],
  unmanagedVpks: [],
  compatibilityModIds: [],
  excludedModIds: [],
  protectedResources: [],
  scannedMods: 2,
  scannedVpks: 3,
  localizationFiles: 1,
  ignoredVanillaTokens: 0,
  ignoredHistoricalTokens: 0,
  changedTokens: 1,
  newTokens: 0,
  compiledDataFiles: 1,
  ignoredVanillaRows: 0,
  changedRows: 1,
  newRows: 0,
  conflicts: [
    {
      key: "text",
      filePath: "resource/localization/test_english.txt",
      token: "hero_name",
      vanillaValue: "Original",
      candidates: [
        { modId: "skin", sourceVpk: "first.vpk", value: "First", priority: 0 },
        {
          modId: "skin",
          sourceVpk: "second.vpk",
          value: "Second",
          priority: 1,
        },
      ],
    },
  ],
  compiledDataConflicts: [
    {
      key: "data",
      filePath: "scripts/heroes.vdata_c",
      rowName: "hero_test",
      fieldPath: "model",
      existedInVanilla: true,
      candidates: [
        { modId: "skin", sourceVpk: "first.vpk", priority: 0 },
        { modId: "skin", sourceVpk: "second.vpk", priority: 1 },
      ],
    },
  ],
  heroIdReassignments: [],
  snapshotWarnings: [],
  parseWarnings: [],
  assetRepairs: [],
  assetWarnings: [],
  dataRepairs: [],
  dataWarnings: [],
};

describe("compatibility review choices", () => {
  test("keeps load order unless a user selects a different winner", () => {
    expect(compatibilityResolutions(analysis, {})).toEqual([]);
    expect(
      compatibilityResolutions(analysis, {
        text: "load-order",
        data: "load-order",
      }),
    ).toEqual([]);
  });
  test("distinguishes two archives from the same mod for text and game data", () => {
    expect(
      compatibilityResolutions(analysis, {
        text: "candidate:1",
        data: "candidate:1",
      }),
    ).toEqual([
      {
        conflictKey: "text",
        winnerModId: "skin",
        winnerSourceVpk: "second.vpk",
        winnerValue: "Second",
        useVanilla: false,
      },
      {
        conflictKey: "data",
        winnerModId: "skin",
        winnerSourceVpk: "second.vpk",
        winnerValue: null,
        useVanilla: false,
      },
    ]);
  });
  test("retains explicit vanilla choices and ignores unavailable candidates", () => {
    expect(
      compatibilityResolutions(analysis, {
        text: "vanilla",
        data: "candidate:9",
      }),
    ).toEqual([
      {
        conflictKey: "text",
        winnerModId: null,
        winnerSourceVpk: null,
        winnerValue: null,
        useVanilla: true,
      },
    ]);
  });
});

describe("compatibility repair summaries", () => {
  test("groups large animation repairs without mixing mods, kinds, or losing archive paths", () => {
    const base = {
      modId: "baba",
      kind: "animationClipTracks" as const,
      sourceVpk: "first.vpk",
      filePath: "models/clips/0.vnmclip_c",
    };
    const repairs = Array.from({ length: 291 }, (_, i) => ({
      ...base,
      sourceVpk: i % 2 ? "second.vpk" : "first.vpk",
      filePath: `models/clips/${i}.vnmclip_c`,
    }));
    const groups = groupAssetRepairs([
      ...repairs,
      { ...base, modId: "other" },
      { ...base, kind: "cameraAttachmentFrame" },
    ]);
    expect(groups).toHaveLength(3);
    expect(groups[0]?.files).toEqual(repairs);
    expect(groups[1]?.modId).toBe("other");
    expect(groups[2]?.kind).toBe("cameraAttachmentFrame");
  });
});
