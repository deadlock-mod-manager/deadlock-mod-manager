import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FixtureRoute } from "./fixture-server";
import { buildSyntheticVpk } from "./vpk";
import { collectFileInventory, type CreatedWorld } from "./world";

/**
 * A Grimoire install as Grimoire itself leaves it on disk: its userData
 * folder (settings, metadata sidecar, profiles) plus VPKs in the game's shared
 * addons folders. The four mods cover every reader fallback:
 * - a GameBanana mod with a matching fingerprint (catalog enriches it),
 * - a local mod in a Grimoire overflow root (`addons1`, not a DMM shard),
 * - a disabled GameBanana sound with no fingerprint (older Grimoire) whose
 *   catalog lookup fails, so the interchange data has to carry it,
 * - an enabled slot whose recorded fingerprint no longer matches (state
 *   drift), so it must arrive as a local mod, never under the stale identity.
 */
export const GRIMOIRE_SKIN_ID = "900101";
export const GRIMOIRE_SKIN_FILE_ID = 910101;
export const GRIMOIRE_SKIN_CATALOG_NAME = "E2E Grimoire Skin (catalog)";
export const GRIMOIRE_SOUND_ID = "900202";
export const GRIMOIRE_SOUND_NAME = "E2E Parked Sound";
export const GRIMOIRE_OVERFLOW_NAME = "E2E Overflow Local";
export const GRIMOIRE_DRIFTED_NAME = "Grimoire mod (pak02)";
/** The GameBanana submission the user links the overflow mod to by hand. */
export const LINKED_OVERFLOW_ID = "900404";
export const LINKED_OVERFLOW_NAME = "E2E Overflow (catalog)";
/** Grimoire profile names; the second collides with DMM's default profile. */
export const LOADOUT_PROFILE = "E2E Loadout";
export const CASUAL_PROFILE = "Default Profile";
export const CASUAL_PROFILE_IMPORTED = "Default Profile (2)";
export const PROFILE_CROSSHAIR = {
  pipGap: 7,
  colorR: 12,
  colorG: 34,
  colorB: 56,
};
export const PRESET_CROSSHAIR = {
  pipGap: 3,
  colorR: 200,
  colorG: 10,
  colorB: 10,
  pipGapStatic: true,
};
const STALE_IDENTITY_ID = 900303;
const timestamp = 1_780_000_000;

export type GrimoireFixtureMod = {
  key: string;
  name: string;
  enabled: boolean;
  sourcePath: string;
  bytes: Buffer;
};

const vpk = (label: string) =>
  buildSyntheticVpk([
    { path: `scripts/grimoire-${label}.txt`, contents: `Grimoire ${label}\n` },
  ]);

const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

export const grimoireUserData = (world: string) =>
  path.join(world, "foreign-apps", "grimoire");

export const grimoireFixtureMods = (gameRoot: string): GrimoireFixtureMod[] => {
  const citadel = path.join(gameRoot, "game", "citadel");
  const skin = vpk("skin");
  const overflow = vpk("overflow");
  const sound = vpk("sound");
  const drifted = vpk("drifted");
  return [
    {
      key: `gamebanana:mod:${GRIMOIRE_SKIN_ID}`,
      name: GRIMOIRE_SKIN_CATALOG_NAME,
      enabled: true,
      sourcePath: path.join(citadel, "addons", "pak01_dir.vpk"),
      bytes: skin,
    },
    {
      key: `local:sha256:${sha256(drifted)}`,
      name: GRIMOIRE_DRIFTED_NAME,
      enabled: true,
      sourcePath: path.join(citadel, "addons", "pak02_dir.vpk"),
      bytes: drifted,
    },
    {
      key: `local:sha256:${sha256(overflow)}`,
      name: GRIMOIRE_OVERFLOW_NAME,
      enabled: true,
      sourcePath: path.join(citadel, "addons1", "pak01_dir.vpk"),
      bytes: overflow,
    },
    {
      key: `gamebanana:sound:${GRIMOIRE_SOUND_ID}`,
      name: GRIMOIRE_SOUND_NAME,
      enabled: false,
      sourcePath: path.join(
        citadel,
        "addons",
        ".disabled",
        "e2e_parked_sound_dir.vpk",
      ),
      bytes: sound,
    },
  ];
};

export const prepareGrimoireWorld = async (
  world: CreatedWorld,
): Promise<void> => {
  const gameRoot = world.configuration.roots.game;
  const mods = grimoireFixtureMods(gameRoot);
  for (const mod of mods) {
    await mkdir(path.dirname(mod.sourcePath), { recursive: true });
    await writeFile(mod.sourcePath, mod.bytes);
  }
  const [skin, , overflow] = mods;
  const userData = grimoireUserData(world.directory);
  await mkdir(userData, { recursive: true });
  await writeFile(
    path.join(userData, "settings.json"),
    JSON.stringify(
      {
        deadlockPath: gameRoot,
        devMode: false,
        activeProfileId: "profile_e2e",
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(userData, "profiles.json"),
    JSON.stringify([
      {
        id: "profile_e2e",
        name: LOADOUT_PROFILE,
        mods: [
          {
            fileName: "pak09_dir.vpk",
            gameBananaId: Number(GRIMOIRE_SKIN_ID),
            enabled: true,
            priority: 0,
          },
          {
            fileName: "e2e_parked_sound_dir.vpk",
            gameBananaId: Number(GRIMOIRE_SOUND_ID),
            enabled: true,
            priority: 1,
          },
        ],
        crosshair: PROFILE_CROSSHAIR,
        autoexecCommands: ["fps_max 240"],
      },
      {
        id: "profile_casual",
        name: CASUAL_PROFILE,
        mods: [
          { fileName: "addons1/pak01_dir.vpk", enabled: false, priority: 0 },
          { fileName: "long_gone_dir.vpk", enabled: true, priority: 1 },
        ],
      },
    ]),
  );
  await writeFile(
    path.join(userData, "crosshair-presets.json"),
    JSON.stringify({
      presets: [
        {
          id: "preset-dot",
          name: "E2E Dot",
          settings: PRESET_CROSSHAIR,
          thumbnail: "",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      activePresetId: "preset-dot",
    }),
  );
  await writeFile(
    path.join(userData, "mod-metadata.json"),
    JSON.stringify(
      {
        "pak01_dir.vpk": {
          modName: "E2E Grimoire Skin",
          author: "E2E Author",
          gameBananaId: Number(GRIMOIRE_SKIN_ID),
          gameBananaFileId: GRIMOIRE_SKIN_FILE_ID,
          categoryName: "Skins",
          sourceFileName: "grimoire_skin",
          sourceSection: "Mod",
          sha256: sha256(skin.bytes),
        },
        "pak02_dir.vpk": {
          modName: "Stale identity",
          gameBananaId: STALE_IDENTITY_ID,
          sourceSection: "Mod",
          sha256: sha256(Buffer.from("bytes that were replaced")),
        },
        "addons1/pak01_dir.vpk": {
          modName: GRIMOIRE_OVERFLOW_NAME,
          sha256: sha256(overflow.bytes),
        },
        "e2e_parked_sound_dir.vpk": {
          modName: GRIMOIRE_SOUND_NAME,
          gameBananaId: Number(GRIMOIRE_SOUND_ID),
          sourceSection: "Sound",
          lastPriority: 7,
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(gameRoot, "protected.txt"),
    "Grimoire import must not touch this\n",
  );
  await mkdir(world.artifactsDirectory, { recursive: true });
  await writeFile(
    path.join(world.artifactsDirectory, "grimoire-before.json"),
    JSON.stringify(await collectFileInventory(userData), null, 2),
  );
};

export const grimoireRoutes = async () => (origin: string) => {
  const files = [
    {
      _idRow: GRIMOIRE_SKIN_FILE_ID,
      _sFile: "grimoire_skin.zip",
      _nFilesize: 1,
      _sDownloadUrl: `${origin}/dl/${GRIMOIRE_SKIN_FILE_ID}`,
      _tsDateAdded: timestamp,
      _sMd5Checksum: "0".repeat(32),
    },
  ];
  const profile = {
    _idRow: Number(GRIMOIRE_SKIN_ID),
    _sModelName: "Mod",
    _sName: GRIMOIRE_SKIN_CATALOG_NAME,
    _sProfileUrl: `https://gamebanana.com/mods/${GRIMOIRE_SKIN_ID}`,
    _tsDateAdded: timestamp,
    _tsDateModified: timestamp,
    _bHasFiles: true,
    _aSubmitter: { _sName: "E2E Author" },
    _aRootCategory: { _sName: "Skins" },
    _aCategory: { _sName: "Skins" },
    _sText: "Synthetic Grimoire import fixture.",
    _aFiles: files,
  };
  const linked = {
    ...profile,
    _idRow: Number(LINKED_OVERFLOW_ID),
    _sName: LINKED_OVERFLOW_NAME,
    _sProfileUrl: `https://gamebanana.com/mods/${LINKED_OVERFLOW_ID}`,
    _aFiles: [],
  };
  const routes: FixtureRoute[] = [
    {
      method: "GET",
      path: `/apiv11/Mod/${GRIMOIRE_SKIN_ID}/ProfilePage`,
      status: 200,
      body: JSON.stringify(profile),
    },
    {
      method: "GET",
      path: `/apiv11/Mod/${LINKED_OVERFLOW_ID}/ProfilePage`,
      status: 200,
      body: JSON.stringify(linked),
    },
    {
      method: "GET",
      path: `/apiv11/Mod/${LINKED_OVERFLOW_ID}/DownloadPage`,
      status: 200,
      body: JSON.stringify({ _aFiles: [] }),
    },
    {
      // "Analyze" finds nothing: the user links by hand.
      method: "POST",
      path: "/api/v2/vpk-analyse-hashes",
      status: 200,
      body: "[]",
    },
    {
      method: "GET",
      path: `/apiv11/Mod/${GRIMOIRE_SKIN_ID}/DownloadPage`,
      status: 200,
      body: JSON.stringify({ _aFiles: files }),
    },
    {
      method: "GET",
      path: `/apiv11/Sound/${GRIMOIRE_SOUND_ID}/DownloadPage`,
      status: 404,
      body: '{"_sErrorCode":"ITEM_NOT_FOUND"}',
    },
    {
      method: "GET",
      path: `/apiv11/Sound/${GRIMOIRE_SOUND_ID}/ProfilePage`,
      status: 404,
      body: '{"_sErrorCode":"ITEM_NOT_FOUND"}',
    },
    {
      method: "GET",
      path: "/apiv11/Core/Item/Data",
      query: { "fields[]": "Url().sProfileUrl()" },
      status: 200,
      body: JSON.stringify([profile._sProfileUrl, timestamp, files]),
    },
    {
      method: "GET",
      path: "/apiv11/Util/Fileservers",
      status: 200,
      body: '{"_aRecords":[]}',
    },
  ];
  return routes;
};
