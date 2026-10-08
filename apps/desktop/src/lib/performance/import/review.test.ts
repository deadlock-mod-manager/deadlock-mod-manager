import { describe, expect, test } from "bun:test";
import type { ImportVariant } from "@/types/generated/ImportVariant";
import type { ResolvedEntry } from "@/types/generated/ResolvedEntry";
import {
  commonSinceBuild,
  describeArchiveExtras,
  entryDisplayName,
  formatBuildDate,
  groupReviewEntries,
  pickableVariants,
  summarizeSections,
} from "./review";

const entry = (
  path: string[],
  status: ResolvedEntry["status"],
  overrides: Partial<ResolvedEntry> = {},
): ResolvedEntry => ({
  path,
  value: "0",
  configValue: "0",
  liveValue: "1",
  status,
  notes: [],
  overridden: false,
  inConfig: true,
  category: "other",
  gameplay: null,
  meta: null,
  ...overrides,
});

const names = (entries: ResolvedEntry[]) =>
  entries.map((item) => entryDisplayName(item.path));

describe("groupReviewEntries", () => {
  test("puts each entry where the review explains it", () => {
    const groups = groupReviewEntries([
      entry(["ConVars", "r_ssao"], "applies"),
      entry(["ConVars", "r_bloom"], "unchanged"),
      entry(["ConVars", "citadel_camera_hero_fov"], "applies", {
        gameplay: "camera",
      }),
      entry(["ConVars", "r_shadows"], "blocked"),
      entry(["ConVars", "panorama_max_fps"], "removed"),
      entry(["ConVars", "echo"], "notConvar"),
      entry(["ConVars", "sv_cheats"], "denied"),
      entry(["ConVars", "cl_showpos"], "omitted", { gameplay: "devtools" }),
      entry(["SceneSystem", "CSMCascadeResolution"], "engineSection"),
      entry(["PGIVersion"], "excluded"),
    ]);

    expect(names(groups.willApply)).toEqual(["r_ssao"]);
    expect(names(groups.alreadySet)).toEqual(["r_bloom"]);
    expect(names(groups.cameraVisibility)).toEqual(["citadel_camera_hero_fov"]);
    expect(names(groups.blocked)).toEqual(["r_shadows"]);
    expect(names(groups.removed)).toEqual(["panorama_max_fps", "echo"]);
    expect(names(groups.refused)).toEqual(["sv_cheats"]);
    expect(names(groups.devtools)).toEqual(["cl_showpos"]);
    expect(names(groups.engineSections)).toEqual([
      "SceneSystem › CSMCascadeResolution",
    ]);
    expect(names(groups.excluded)).toEqual(["PGIVersion"]);
  });

  test("keeps toggled groups populated when the toggle is flipped", () => {
    const groups = groupReviewEntries([
      entry(["ConVars", "r_aspectratio"], "omitted", {
        gameplay: "visibility",
        overridden: true,
      }),
      entry(["SceneSystem", "CSMCascadeResolution"], "applies"),
    ]);

    expect(names(groups.cameraVisibility)).toEqual(["r_aspectratio"]);
    expect(names(groups.engineSections)).toEqual([
      "SceneSystem › CSMCascadeResolution",
    ]);
    expect(groups.willApply).toEqual([]);
  });

  test("an enabled developer tool counts as a written setting", () => {
    const groups = groupReviewEntries([
      entry(["ConVars", "cl_showfps"], "applies", { gameplay: "devtools" }),
    ]);
    expect(names(groups.willApply)).toEqual(["cl_showfps"]);
  });
});

describe("entryDisplayName", () => {
  test("drops the ConVars section and joins object keys", () => {
    expect(entryDisplayName(["convars", "rate", "max"])).toBe("rate.max");
  });
});

describe("summarizeSections", () => {
  test("names the busiest sections and counts the rest", () => {
    const edits = [
      entry(["Particles", "a"], "engineSection"),
      entry(["SceneSystem", "a"], "engineSection"),
      entry(["SceneSystem", "b"], "engineSection"),
      entry(["RenderSystem", "a"], "engineSection"),
      entry(["Engine2", "a"], "engineSection"),
    ];
    expect(summarizeSections(edits, 2)).toEqual({
      shown: ["SceneSystem", "Particles"],
      rest: 2,
    });
  });
});

const blockedMeta = (statusSinceBuild: number): ResolvedEntry["meta"] => ({
  name: "x",
  kind: "bool",
  default: null,
  min: null,
  max: null,
  step: null,
  enumValues: [],
  flags: [],
  help: null,
  label: null,
  description: null,
  category: "other",
  gameplay: null,
  sideEffects: null,
  status: "blocked",
  statusSinceBuild,
});

describe("commonSinceBuild", () => {
  test("prefers notes, falls back to convar metadata, picks the most common", () => {
    expect(
      commonSinceBuild([
        entry(["ConVars", "a"], "blocked", {
          notes: [{ kind: "sinceBuild", build: 6711 }],
        }),
        entry(["ConVars", "b"], "blocked", { meta: blockedMeta(6711) }),
        entry(["ConVars", "c"], "blocked", { meta: blockedMeta(6417) }),
      ]),
    ).toBe(6711);
    expect(commonSinceBuild([entry(["ConVars", "a"], "blocked")])).toBeNull();
  });
});

describe("formatBuildDate", () => {
  const now = new Date("2026-10-08T12:00:00Z");

  test("shows month and day for this year's builds", () => {
    expect(formatBuildDate("2026-04-28", "en-US", now)).toBe("Apr 28");
  });

  test("adds the year for older builds and keeps unparseable dates", () => {
    expect(formatBuildDate("2025-12-02", "en-US", now)).toBe("Dec 2, 2025");
    expect(formatBuildDate("someday", "en-US", now)).toBe("someday");
  });
});

const variant = (
  path: string,
  overrides: Partial<ImportVariant> = {},
): ImportVariant => ({
  path,
  label: path,
  format: "fullGameinfo",
  duplicateOf: null,
  ...overrides,
});

describe("archive variants", () => {
  const variants = [
    variant("FPS/gameinfo.gi"),
    variant("Potato/gameinfo.gi"),
    variant("FPS (ES)/gameinfo.gi", { duplicateOf: "FPS/gameinfo.gi" }),
    variant("FPS (FR)/gameinfo.gi", { duplicateOf: "FPS/gameinfo.gi" }),
    variant("video.txt", { format: "videoTxt" }),
  ];

  test("translated copies and video.txt are not offered as versions", () => {
    expect(pickableVariants(variants).map((item) => item.path)).toEqual([
      "FPS/gameinfo.gi",
      "Potato/gameinfo.gi",
    ]);
  });

  test("describes what else the archive holds", () => {
    expect(describeArchiveExtras(variants)).toEqual({
      duplicates: 2,
      hasVideoTxt: true,
    });
  });
});
