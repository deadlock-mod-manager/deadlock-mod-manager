import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { LocalMod } from "../../src/types/mods";
import type { FixtureRequest, FixtureRoute } from "./fixture-server";
import {
  BULK_HYDRATION_FIELDS,
  BULK_UPDATE_FIELDS,
} from "./gamebanana-fixtures";
import { fixtureMod } from "./mod-fixtures";
import { readPersistedDocument } from "./observations";
import { prepareInstalledProfiles } from "./profile-fixtures";
import { buildSyntheticVpk } from "./vpk";
import type { CreatedWorld } from "./world";

export const HEALTH_PROFILE = {
  id: "profile_960_health",
  folder: "profile_960_health",
  name: "E2E Health",
};
export const HEALTH_MOD = { id: "960001", name: "E2E Hero Names" };
// A loose VPK: the update skips extraction, so the mod never leaves Installed.
const FILE_NAME = `${HEALTH_MOD.id}.vpk`;
const FILE_ID = 960101;
const OLD_DATE = 1_780_000_000;
// Before the run, so the updated mod no longer counts as outdated.
const NEW_DATE = 1_790_000_000;

const LOCALIZATION =
  "resource/localization/citadel_heroes/citadel_heroes_english.txt";
const localization = (tokens: Record<string, string>) =>
  `"lang"\n{\n\t"Language"\t\t"English"\n\t"Tokens"\n\t{\n${Object.entries(
    tokens,
  )
    .map(([token, value]) => `\t\t"${token}"\t\t"${value}"\n`)
    .join("")}\t}\n}\n`;
// The installed version renames both heroes the game has; the update is an
// outdated copy of the file that lacks the newer hero, which the repairs can
// restore. So the mod works before the update and can be fixed after it.
const GAME_TOKENS = { hero_e2e: "Hero", hero_e2e_new: "New hero" };
const ORIGINAL_PAYLOAD = buildSyntheticVpk([
  {
    path: LOCALIZATION,
    contents: localization({
      hero_e2e: "Renamed hero",
      hero_e2e_new: "Renamed new hero",
    }),
  },
]);
export const UPDATED_PAYLOAD = buildSyntheticVpk([
  { path: LOCALIZATION, contents: localization({ hero_e2e: "Renamed hero" }) },
]);

export async function prepareHealthUpdateWorld(world: CreatedWorld) {
  const { roots } = world.configuration;
  const gameText = path.join(roots.game, "game", "citadel", LOCALIZATION);
  await mkdir(path.dirname(gameText), { recursive: true });
  await writeFile(gameText, localization(GAME_TOKENS));
  await prepareInstalledProfiles(
    world,
    [
      {
        profile: HEALTH_PROFILE,
        modIds: [HEALTH_MOD.id],
        payload: () => ORIGINAL_PAYLOAD,
      },
    ],
    HEALTH_PROFILE.id,
  );
  const persisted = z
    .object({ state: z.record(z.string(), z.json()), version: z.number() })
    .parse(await readPersistedDocument(world.directory));
  const mod: LocalMod = Object.assign(fixtureMod(HEALTH_MOD.id, 0), {
    name: HEALTH_MOD.name,
    remoteUrl: `https://gamebanana.com/mods/${HEALTH_MOD.id}`,
    downloadable: true,
    downloadedAt: new Date(OLD_DATE * 1000),
    selectedDownloads: [
      {
        name: FILE_NAME,
        url: `gamebanana-file://${HEALTH_MOD.id}/${FILE_ID}`,
        size: ORIGINAL_PAYLOAD.length,
        createdAt: new Date(OLD_DATE * 1000),
        updatedAt: null,
        md5Checksum: null,
      },
    ],
    installedFileTree: {
      files: [
        {
          name: FILE_NAME,
          path: FILE_NAME,
          size: ORIGINAL_PAYLOAD.length,
          is_selected: true,
          archive_name: FILE_NAME,
        },
      ],
      total_files: 1,
      has_multiple_files: false,
    },
  });
  const state = {
    ...persisted.state,
    localMods: [mod],
    profiles: {
      default: {
        id: "default",
        name: "Default Profile",
        folderName: null,
        isDefault: true,
        createdAt: new Date(0),
        mods: [],
        enabledMods: {},
      },
      [HEALTH_PROFILE.id]: {
        id: HEALTH_PROFILE.id,
        name: HEALTH_PROFILE.name,
        folderName: HEALTH_PROFILE.folder,
        isDefault: false,
        createdAt: new Date(0),
        mods: [mod],
        enabledMods: {
          [mod.remoteId]: {
            remoteId: mod.remoteId,
            enabled: true,
            lastModified: new Date(0),
          },
        },
      },
    },
    fileserverPreference: "default",
    autoUpdateEnabled: false,
    // The launch asks before fixing, so the prompt shows what it would fix.
    autoFixMods: false,
  };
  await writeFile(
    path.join(roots.appData, "state.json"),
    JSON.stringify({ "local-config": JSON.stringify({ ...persisted, state }) }),
  );
  const store = path.join(roots.appData, "mods", mod.remoteId);
  await mkdir(store, { recursive: true });
  await writeFile(path.join(store, FILE_NAME), ORIGINAL_PAYLOAD);
}

const json = <T>(url: string, body: T): FixtureRoute => ({
  method: "GET",
  path: url,
  status: 200,
  body: JSON.stringify(body),
});

export async function healthUpdateRoutes() {
  return (origin: string): FixtureRoute[] => {
    const files = [
      {
        _idRow: FILE_ID,
        _sFile: FILE_NAME,
        _nFilesize: UPDATED_PAYLOAD.length,
        _sDownloadUrl: `${origin}/dl/${FILE_ID}`,
        _tsDateAdded: NEW_DATE,
        _sMd5Checksum: createHash("md5").update(UPDATED_PAYLOAD).digest("hex"),
      },
    ];
    const profile = {
      _idRow: Number(HEALTH_MOD.id),
      _sModelName: "Mod",
      _sName: HEALTH_MOD.name,
      _sProfileUrl: `https://gamebanana.com/mods/${HEALTH_MOD.id}`,
      _tsDateAdded: OLD_DATE,
      _tsDateModified: NEW_DATE,
      _bHasFiles: true,
      _sText: "Synthetic mod health fixture",
      _aSubmitter: { _sName: "E2E" },
      _aRootCategory: { _sName: "Skins" },
      _aCategory: { _sName: "Skins" },
      _aFiles: files,
      _aRequirements: [],
    };
    return [
      json("/apiv11/Mod/Index", {
        _aMetadata: { _nRecordCount: 1, _nPerpage: 50, _bIsComplete: true },
        _aRecords: [profile],
      }),
      {
        ...json("/Core/Item/Data", [
          [
            profile["_sName"],
            0,
            "Skins",
            "Skins",
            profile["_sText"],
            profile["_sText"],
            files,
          ],
        ]),
        query: { "fields[]": BULK_HYDRATION_FIELDS },
      },
      {
        ...json("/Core/Item/Data", [
          [profile["_sProfileUrl"], NEW_DATE, files],
        ]),
        query: {
          "fields[]": [BULK_UPDATE_FIELDS],
          "itemid[]": [HEALTH_MOD.id],
        },
      },
      json("/apiv11/Util/Fileservers", { _aRecords: [] }),
      json(`/apiv11/Mod/${HEALTH_MOD.id}/ProfilePage`, profile),
      json(`/apiv11/Mod/${HEALTH_MOD.id}/DownloadPage`, { _aFiles: files }),
      json(`/apiv11/Mod/${HEALTH_MOD.id}/Updates`, {
        _aMetadata: { _nRecordCount: 0, _nPerpage: 10, _bIsComplete: true },
        _aRecords: [],
      }),
      json(`/api/v2/reports/mod/${HEALTH_MOD.id}/counts`, {
        total: 0,
        open: 0,
        resolved: 0,
        dismissed: 0,
      }),
      {
        method: "GET",
        path: `/dl/${FILE_ID}`,
        status: 200,
        body: UPDATED_PAYLOAD,
      },
    ];
  };
}

/** The update downloads its one loose VPK exactly once. */
export function assertHealthUpdateNetwork(
  _id: string,
  requests: readonly FixtureRequest[],
) {
  assert.deepEqual(
    requests
      .filter(
        (request) => request.method === "GET" && request.url.startsWith("/dl/"),
      )
      .map((request) => request.url),
    [`/dl/${FILE_ID}`],
  );
}
