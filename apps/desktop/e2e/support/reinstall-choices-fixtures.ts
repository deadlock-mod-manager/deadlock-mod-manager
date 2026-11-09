import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { createArchive } from "./archive-fixtures";
import type { FixtureRoute } from "./fixture-server";
import {
  BULK_HYDRATION_FIELDS,
  BULK_UPDATE_FIELDS,
  CATALOG_MOD_ID,
} from "./gamebanana-fixtures";
import { prepareInstalledProfiles, profilePayload } from "./profile-fixtures";
import { buildSyntheticVpk, localizationText } from "./vpk";
import type { CreatedWorld } from "./world";

// A fixable GameBanana mod first in a three-mod load order, so Reinstall has
// a fix choice and a place to keep. The other two are local imports, which
// Reinstall, Nuke & Reinstall and the update check leave alone.

export const CHOICES = {
  id: "profile_450_choices",
  folder: "profile_450_choices_choices",
  name: "E2E Choices",
};

export const REINSTALLED_MOD = CATALOG_MOD_ID;
export const LOAD_ORDER = [
  REINSTALLED_MOD,
  "local-00000000-0000-4000-8000-000000000002",
  "local-00000000-0000-4000-8000-000000000003",
];

const TEXT_FILE = "resource/localization/e2e_choices/e2e_choices_english.txt";
const VPK_NAME = "choices.vpk";
const FILE_NAME = "choices.zip";
const FILE_ID = 910002;
const DATE = 1_780_000_000;
const PROFILE_URL = `https://gamebanana.com/mods/${REINSTALLED_MOD}`;
const DESCRIPTION = "Synthetic reinstall choices fixture";

// Fixable: its copy of a game text file lacks a game token.
export const REINSTALLED_PAYLOAD = buildSyntheticVpk([
  { path: TEXT_FILE, contents: localizationText({ e2e_kept: "Kept" }) },
]);

const archive = () => createArchive({ [VPK_NAME]: REINSTALLED_PAYLOAD });

export const prepareReinstallChoicesWorld = async (
  world: CreatedWorld,
): Promise<void> => {
  const { roots } = world.configuration;
  const citadel = path.join(roots.game, "game", "citadel");
  await writeFile(
    path.join(citadel, "steam.inf"),
    "ClientVersion=7000\nServerVersion=7000\n",
  );
  const text = path.join(citadel, TEXT_FILE);
  await mkdir(path.dirname(text), { recursive: true });
  await writeFile(
    text,
    localizationText({ e2e_kept: "Kept", e2e_new: "New game text" }),
  );
  await prepareInstalledProfiles(
    world,
    [
      {
        profile: CHOICES,
        modIds: LOAD_ORDER,
        payload: (modId) =>
          modId === REINSTALLED_MOD
            ? REINSTALLED_PAYLOAD
            : profilePayload(modId),
      },
    ],
    CHOICES.id,
  );

  // Turn the reinstalled mod into a GameBanana download, as a player's would
  // be, so Reinstall has something to download.
  const storePath = path.join(roots.appData, "state.json");
  const outer = z
    .object({ "local-config": z.string() })
    .parse(JSON.parse(await readFile(storePath, "utf8")));
  const persisted = z
    .object({
      state: z.looseObject({
        localMods: z.array(z.looseObject({ remoteId: z.string() })),
        profiles: z.record(
          z.string(),
          z.looseObject({
            mods: z.array(z.looseObject({ remoteId: z.string() })),
          }),
        ),
      }),
      version: z.number(),
    })
    .parse(JSON.parse(outer["local-config"]));
  const body = await archive();
  const download = {
    name: FILE_NAME,
    url: `gamebanana-file://${REINSTALLED_MOD}/${FILE_ID}`,
    size: body.length,
    createdAt: new Date(DATE * 1000),
    updatedAt: null,
    md5Checksum: null,
  };
  const catalog = <T extends { remoteId: string }>(mod: T) =>
    mod.remoteId !== REINSTALLED_MOD
      ? mod
      : {
          ...mod,
          remoteUrl: PROFILE_URL,
          downloadable: true,
          downloadedAt: new Date(DATE * 1000),
          downloads: [download],
          selectedDownloads: [download],
          installedFileTree: {
            files: [
              {
                name: VPK_NAME,
                path: VPK_NAME,
                size: REINSTALLED_PAYLOAD.length,
                is_selected: true,
                archive_name: FILE_NAME,
              },
            ],
            total_files: 1,
            has_multiple_files: false,
          },
        };
  const state = {
    ...persisted.state,
    localMods: persisted.state.localMods.map(catalog),
    profiles: Object.fromEntries(
      Object.entries(persisted.state.profiles).map(([id, profile]) => [
        id,
        { ...profile, mods: profile.mods.map(catalog) },
      ]),
    ),
    autoUpdateEnabled: false,
    // Nothing may change the choice behind the case's back.
    autoFixMods: false,
  };
  await writeFile(
    storePath,
    JSON.stringify({
      "local-config": JSON.stringify({ ...persisted, state }),
    }),
  );
  const store = path.join(roots.appData, "mods", REINSTALLED_MOD);
  await mkdir(store, { recursive: true });
  await writeFile(path.join(store, FILE_NAME), body);
};

export const reinstallChoicesRoutes = async () => {
  const body = await archive();
  return (origin: string) => routes(origin, body);
};

const json = <T>(url: string, value: T): FixtureRoute => ({
  method: "GET",
  path: url,
  status: 200,
  body: JSON.stringify(value),
});

const routes = (origin: string, body: Buffer): FixtureRoute[] => {
  const files = [
    {
      _idRow: FILE_ID,
      _sFile: FILE_NAME,
      _nFilesize: body.length,
      _sDownloadUrl: `${origin}/dl/${FILE_ID}`,
      _tsDateAdded: DATE,
      _sMd5Checksum: createHash("md5").update(body).digest("hex"),
    },
  ];
  const profile = {
    _idRow: Number(REINSTALLED_MOD),
    _sModelName: "Mod",
    _sName: REINSTALLED_MOD,
    _sProfileUrl: PROFILE_URL,
    _tsDateAdded: DATE,
    _tsDateModified: DATE,
    _bHasFiles: true,
    _sText: DESCRIPTION,
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
        [REINSTALLED_MOD, 0, "Skins", "Skins", DESCRIPTION, DESCRIPTION, files],
      ]),
      query: { "fields[]": BULK_HYDRATION_FIELDS },
    },
    {
      ...json("/Core/Item/Data", [[PROFILE_URL, DATE, files]]),
      query: {
        "fields[]": [BULK_UPDATE_FIELDS],
        "itemid[]": [REINSTALLED_MOD],
      },
    },
    json("/apiv11/Util/Fileservers", { _aRecords: [] }),
    json(`/apiv11/Mod/${REINSTALLED_MOD}/ProfilePage`, profile),
    json(`/apiv11/Mod/${REINSTALLED_MOD}/DownloadPage`, { _aFiles: files }),
    json(`/apiv11/Mod/${REINSTALLED_MOD}/Updates`, {
      _aMetadata: { _nRecordCount: 0, _nPerpage: 10, _bIsComplete: true },
      _aRecords: [],
    }),
    json(`/api/v2/reports/mod/${REINSTALLED_MOD}/counts`, {
      total: 0,
      open: 0,
      resolved: 0,
      dismissed: 0,
    }),
    { method: "GET", path: `/dl/${FILE_ID}`, status: 200, body },
  ];
};
