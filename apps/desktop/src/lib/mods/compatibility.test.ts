import { describe, expect, test } from "bun:test";
import type { LocalizationOverlayAnalysis } from "@/components/my-mods/localization-conflict-review";
import { compatibilityResolutions } from "./compatibility";

const analysis: LocalizationOverlayAnalysis = {
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
