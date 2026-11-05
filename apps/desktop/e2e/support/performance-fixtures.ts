import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { CreatedWorld } from "./world";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CATALOG = path.resolve(
  HERE,
  "../../../../packages/perf-catalog/data/catalog.json",
);

/** Two bundled presets that both ship a video.txt, with different values. */
export const FIRST_PRESET = "sqooky-max-fps";
export const SECOND_PRESET = "optilock-fps";
/** A setting both presets write, which the player changes in game. */
export const CHANGED_KEY = "r_citadel_antialiasing";

/**
 * The player's own file as Deadlock writes it: CRLF, tabs, a header the app
 * must keep, and a setting the presets overwrite.
 */
export const PLAYER_VIDEO = [
  '"video.cfg"',
  "{",
  '\t"Version"\t\t"20"',
  '\t"DeviceID"\t\t"9988"',
  '\t"setting.defaultres"\t\t"2560"',
  '\t"setting.defaultresheight"\t\t"1440"',
  // No preset writes this one, so every apply must leave it.
  '\t"setting.e2e_player_only"\t\t"7"',
  `\t"setting.${CHANGED_KEY}"\t\t"3"`,
  '\t"setting.mat_viewportscale"\t\t"0.770000"',
  "}",
  "",
].join("\r\n");

const setting = z.object({ key: z.string(), value: z.string() });
const catalogSchema = z.object({
  presets: z.array(
    z.object({
      id: z.string(),
      videoSettings: z.array(setting).default([]),
      videoVariants: z
        .array(z.object({ label: z.string(), settings: z.array(setting) }))
        .default([]),
    }),
  ),
});

/** A preset that ships two video.txt files to pick from. */
export const VARIANT_PRESET = "optilock-ultra-potato";

/**
 * The video.txt settings a bundled preset writes, by lower-case key: its own,
 * or those of the named variant.
 */
export const presetVideo = async (
  presetId: string,
  variant?: string,
): Promise<Map<string, string>> => {
  const catalog = catalogSchema.parse(
    JSON.parse(await readFile(CATALOG, "utf8")),
  );
  const preset = catalog.presets.find((candidate) => candidate.id === presetId);
  const settings = variant
    ? preset?.videoVariants.find((candidate) => candidate.label === variant)
        ?.settings
    : preset?.videoSettings;
  if (!settings || settings.length === 0)
    throw new Error(`Bundled preset ${presetId} ships no such video.txt`);
  return new Map(
    settings.map((setting) => [setting.key.toLowerCase(), setting.value]),
  );
};

export const videoPaths = (world: CreatedWorld["configuration"]) => {
  const performance = path.join(world.roots.appData, "performance");
  return {
    video: path.join(world.roots.game, "game", "citadel", "cfg", "video.txt"),
    backup: path.join(performance, "video-backup.txt"),
    record: path.join(performance, "video.json"),
  };
};

/** `setting.*` values by lower-case key, without the prefix. */
export const readVideoSettings = async (
  file: string,
): Promise<Map<string, string>> => {
  const settings = new Map<string, string>();
  for (const match of (await readFile(file, "utf8")).matchAll(
    /^\s*"setting\.([^"]+)"\s+"([^"]*)"/gm,
  )) {
    settings.set(match[1].toLowerCase(), match[2]);
  }
  return settings;
};

/** Rewrites one setting the way the game does when it's changed in game. */
export const changeInGame = async (
  file: string,
  key: string,
  value: string,
) => {
  const text = await readFile(file, "utf8");
  const line = new RegExp(`("setting\\.${key}"\\s+)"[^"]*"`, "i");
  if (!line.test(text)) throw new Error(`video.txt has no ${key}`);
  await writeFile(file, text.replace(line, `$1"${value}"`));
};

const recordSchema = z.object({
  keys: z.array(
    z.object({
      key: z.string(),
      written: z.string(),
      kept: z.boolean().default(false),
    }),
  ),
});

/** The app's record of what it wrote, as `setting.*` key to kept flag. */
export const readVideoRecord = async (file: string) =>
  new Map(
    recordSchema
      .parse(JSON.parse(await readFile(file, "utf8")))
      .keys.map((key) => [key.key.toLowerCase(), key.kept]),
  );

/** Valve's own gameinfo.gi, which a game update writes over ours. */
export const STOCK_GAMEINFO = path.resolve(
  HERE,
  "../../src-tauri/tests/fixtures/perf_config/stock-2026-09-29.gi",
);
/** A convar the first preset sets and the stock file doesn't have. */
export const CONFIG_CONVAR = "r_farz";

export const gameinfoPath = (world: CreatedWorld["configuration"]) =>
  path.join(world.roots.game, "game", "citadel", "gameinfo.gi");

/** The value gameinfo.gi gives `name`, quoted or not; `undefined` if unset. */
export const readConvar = async (file: string, name: string) =>
  new RegExp(`^\\s*"?${name}"?\\s+"?([^"\\s]+)"?`, "im").exec(
    await readFile(file, "utf8"),
  )?.[1];

/**
 * Valve's file with one line the player added by hand, as a game update
 * leaves it: the config's lines gone, the hand edit kept.
 */
export const stockWithHandEdit = async () =>
  (await readFile(STOCK_GAMEINFO, "utf8")).replace(
    /(\n\tConVars\s*\n\t\{[^\n]*\n)/,
    '$1\t\t"e2e_hand_edit"\t\t"1"\n',
  );

export const preparePerformanceWorld = async (world: CreatedWorld) => {
  const { video } = videoPaths(world.configuration);
  await mkdir(path.dirname(video), { recursive: true });
  await writeFile(video, PLAYER_VIDEO);
  await writeFile(
    gameinfoPath(world.configuration),
    await readFile(STOCK_GAMEINFO),
  );
};
