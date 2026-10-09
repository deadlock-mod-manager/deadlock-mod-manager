import { describe, expect, test } from "bun:test";
import type { ResolvedEntry } from "@/types/generated/ResolvedEntry";
import { highlightConfig } from "./highlight";

const entry = (
  path: string[],
  status: ResolvedEntry["status"],
  gameplay: ResolvedEntry["gameplay"] = null,
): ResolvedEntry => ({
  path,
  value: "1",
  configValue: "1",
  inConfig: true,
  liveValue: null,
  status,
  notes: [],
  overridden: false,
  category: "other",
  gameplay,
  meta: null,
});

const GAMEINFO = `"GameInfo"
{
  game "citadel"
  FileSystem
  {
    SearchPaths // managed by DMM
  }
  SceneSystem
  {
    CSMCascadeResolution 512
  }
  ConVars
  {
    "r_shadows" "0"
    "citadel_hideout_tool" "1"
    "r_rendersun" "0"
  }
}`;

const ENTRIES = [
  entry(["FileSystem", "SearchPaths"], "excluded"),
  entry(["SceneSystem", "CSMCascadeResolution"], "engineSection"),
  entry(["ConVars", "r_shadows"], "blocked"),
  entry(["ConVars", "citadel_hideout_tool"], "omitted", "devtools"),
  entry(["ConVars", "r_rendersun"], "applies"),
];

const tones = (source: string, entries: ResolvedEntry[] | null) =>
  highlightConfig(source, entries).map((line) => line.tone);

describe("highlightConfig", () => {
  test("colors each line by its entry's status, following sections", () => {
    expect(tones(GAMEINFO, ENTRIES)).toEqual([
      "plain", // "GameInfo"
      "plain",
      "plain", // game "citadel"
      "skipped", // FileSystem
      "skipped",
      "skipped",
      "skipped",
      "stripped", // SceneSystem
      "stripped",
      "stripped",
      "stripped",
      "plain", // ConVars: mixed
      "plain",
      "ignored",
      "optIn",
      "applies",
      "plain",
      "plain",
    ]);
  });

  test("matches ConVars snippets and autoexec lines", () => {
    expect(
      tones('ConVars {\n  "r_shadows" "0"\n}\nr_rendersun 0', ENTRIES),
    ).toEqual(["plain", "ignored", "plain", "applies"]);
  });

  test("marks the author's camera and visibility settings as opt-in", () => {
    const camera = [
      entry(["ConVars", "citadel_camera_hero_fov"], "applies", "camera"),
      entry(["ConVars", "cl_glow_brightness"], "omitted", "visibility"),
    ];
    expect(
      tones("citadel_camera_hero_fov 100\ncl_glow_brightness 0", camera),
    ).toEqual(["optIn", "optIn"]);
  });

  test("leaves every line plain before a review", () => {
    expect(new Set(tones(GAMEINFO, null))).toEqual(new Set(["plain"]));
  });

  test("keeps every character so the overlay lines up with the text", () => {
    const rebuilt = highlightConfig(`${GAMEINFO}\n\n  "unterminated`, null)
      .map((line) => line.tokens.map((token) => token.text).join(""))
      .join("\n");
    expect(rebuilt).toBe(`${GAMEINFO}\n\n  "unterminated`);
  });
});
