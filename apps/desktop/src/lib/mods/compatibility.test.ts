import { formatCompatibilityFindings } from "./compatibility-diagnostics";
import { describe, expect, test } from "bun:test";
import type { LocalizationOverlayAnalysis } from "@/components/my-mods/localization-conflict-review";
import {
  compatibilityResolutions,
  compatibilityRepairSummary,
  groupFindingsByMod,
} from "./compatibility";

const analysis: LocalizationOverlayAnalysis = {
  hudChecks: [],
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
  animationChecks: [],
  unloadedModels: [],
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

describe("compatibility finding groups", () => {
  test("groups findings by mod, then label, without losing order or entries", () => {
    const entries = Array.from({ length: 291 }, (_, i) => `clip-${i}`);
    const mods = groupFindingsByMod([
      ...entries.map((entry) => ({ modId: "baba", label: "Tracks", entry })),
      { modId: "other", label: "Tracks", entry: "other-clip" },
      { modId: "baba", label: "Camera", entry: "camera" },
    ]);
    expect(mods).toHaveLength(2);
    expect(mods[0]?.count).toBe(292);
    expect(mods[0]?.groups.map((group) => group.label)).toEqual([
      "Tracks",
      "Camera",
    ]);
    expect(mods[0]?.groups[0]?.entries).toEqual(entries);
    expect(mods[1]?.modId).toBe("other");
  });
});

test("advisory findings alone do not offer repairs", () => {
  expect(
    compatibilityRepairSummary({
      ...analysis,
      conflicts: [],
      compiledDataConflicts: [],
      changedTokens: 0,
      changedRows: 0,
      protectedResources: [{ filePath: "shared.vtex_c", modIds: ["skin"] }],
    }),
  ).toEqual({ repairCount: 0, hasChanges: false });
});
test("shared changes offer apply even without asset repairs", () => {
  expect(compatibilityRepairSummary(analysis)).toEqual({
    repairCount: 0,
    hasChanges: true,
  });
});

test("copied mod findings exclude other mods but retain shared ownership", () => {
  const report = {
    ...analysis,
    inputWarnings: [
      { modId: "skin", filePaths: ["selected-missing.vpk"] },
      { modId: "other", filePaths: ["other-missing.vpk"] },
    ],
    protectedResources: [
      { filePath: "shared.vtex_c", modIds: ["skin", "other"] },
    ],
  };
  const names = new Map([
    ["skin", "Selected skin"],
    ["other", "Other skin"],
  ]);
  const selected = formatCompatibilityFindings(report, names, "skin");
  expect(selected).toContain("Selected skin");
  expect(selected).toContain("selected-missing.vpk");
  expect(selected).toContain("shared.vtex_c");
  expect(selected).not.toContain("other-missing.vpk");
  expect(selected).not.toContain("Other skin");
  expect(selected).toContain("Findings do not prove a mod is broken");
  const all = formatCompatibilityFindings(report, names);
  expect(all).toContain("other-missing.vpk");
  expect(all).toContain("Other skin");
});
