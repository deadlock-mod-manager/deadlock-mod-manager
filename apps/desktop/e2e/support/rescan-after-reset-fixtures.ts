import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ModStatus } from "../../src/types/mods";
import type { FixtureRequest, FixtureRoute } from "./fixture-server";
import {
  CATALOG_MOD_ID,
  catalogVpk,
  createCatalogRoutes,
} from "./gamebanana-fixtures";
import { fixtureMod } from "./mod-fixtures";
import { readPersistedDocument } from "./observations";
import {
  ALPHA,
  prepareInstalledProfiles,
  profilePayload,
} from "./profile-fixtures";
import { buildSyntheticVpk } from "./vpk";
import type { CreatedWorld } from "./world";

/** Local import whose name only its metadata file still knows after a reset. */
export const RESET_LOCAL_MOD = "local-reset-skin";
export const RESET_LOCAL_NAME = "E2E Reset Skin";
/** A disabled mod parked in the base folder under its prefixed name. */
export const RESET_DISABLED_MOD = "900077";
const RESET_DISABLED_FILE = `${RESET_DISABLED_MOD}_red.vpk`;
/** A VPK no manifest entry owns: the only file Analyze should ask about. */
const RESET_STRAY_FILE = "pak04_dir.vpk";

export const resetProfileDirectory = (world: string) =>
  path.join(world, "game-install", "game", "citadel", "addons", ALPHA.folder);

const strayPayload = () =>
  buildSyntheticVpk([
    { path: "scripts/stray-fixture.txt", contents: "Placed by hand\n" },
  ]);

const HASH_PATH = "/api/v2/vpk-analyse-hashes";

/**
 * The catalog fixture, with hash identification that never matches: anything
 * Analyze restores has to come from DMM's own records, not the server.
 */
export const rescanAfterResetRoutes = async () => {
  const catalogRoutes = await createCatalogRoutes("gamebanana-switch-reset");
  return (origin: string): FixtureRoute[] => [
    ...catalogRoutes(origin),
    { method: "POST", path: HASH_PATH, status: 200, body: "[]" },
    // The disabled mod has since left GameBanana: only DMM's records know it.
    {
      method: "GET",
      path: `/apiv11/Mod/${RESET_DISABLED_MOD}/ProfilePage`,
      status: 404,
      body: "{}",
    },
    {
      method: "GET",
      path: `/apiv11/Mod/${RESET_DISABLED_MOD}/DownloadPage`,
      status: 404,
      body: "{}",
    },
  ];
};

export const hashRequests = (requests: readonly FixtureRequest[]) =>
  requests.filter(
    (request) => request.method === "POST" && request.url.includes(HASH_PATH),
  );

/**
 * Profile Alpha as DMM leaves it: the catalog mod enabled across `pak01` and
 * `pak02`, a local import enabled as `pak03`, a disabled catalog mod parked as
 * `900077_red.vpk`, and one hand-placed `pak04` no entry owns.
 */
export const prepareRescanAfterResetWorld = async (world: CreatedWorld) => {
  await prepareInstalledProfiles(
    world,
    [
      {
        profile: ALPHA,
        modIds: [CATALOG_MOD_ID, RESET_LOCAL_MOD],
        slots: [1, 3],
        payload: (modId) =>
          modId === CATALOG_MOD_ID
            ? catalogVpk("common.vpk")
            : profilePayload(modId),
      },
    ],
    ALPHA.id,
  );
  const directory = path.join(
    world.configuration.roots.game,
    "game",
    "citadel",
    "addons",
    ALPHA.folder,
  );
  await writeFile(
    path.join(directory, "pak02_dir.vpk"),
    catalogVpk("blue.vpk"),
  );
  await writeFile(
    path.join(directory, RESET_DISABLED_FILE),
    catalogVpk("red.vpk"),
  );
  await writeFile(path.join(directory, RESET_STRAY_FILE), strayPayload());

  const manifestPath = path.join(directory, ".dmm.json");
  const manifest = z
    .object({
      version: z.number(),
      mods: z.record(z.string(), z.looseObject({})),
    })
    .parse(JSON.parse(await readFile(manifestPath, "utf8")));
  manifest.mods[CATALOG_MOD_ID] = {
    ...manifest.mods[CATALOG_MOD_ID],
    currentVpks: ["pak01_dir.vpk", "pak02_dir.vpk"],
    originalVpkNames: ["blue.vpk", "common.vpk"],
  };
  manifest.mods[RESET_DISABLED_MOD] = {
    enabled: false,
    order: 2,
    shard: 1,
    currentVpks: [],
    disabledVpks: [RESET_DISABLED_FILE],
    originalVpkNames: ["red.vpk"],
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const metadataDirectory = path.join(
    world.configuration.roots.appData,
    "mods",
    RESET_LOCAL_MOD,
  );
  await mkdir(metadataDirectory, { recursive: true });
  await writeFile(
    path.join(metadataDirectory, "metadata.json"),
    JSON.stringify({
      id: RESET_LOCAL_MOD,
      kind: "local",
      name: RESET_LOCAL_NAME,
      author: "E2E",
    }),
  );

  const storePath = path.join(world.configuration.roots.appData, "state.json");
  const persisted = z
    .object({
      state: z.looseObject({
        profiles: z.record(
          z.string(),
          z.looseObject({ mods: z.array(z.looseObject({})) }),
        ),
      }),
      version: z.number(),
    })
    .parse(await readPersistedDocument(world.directory));
  const alpha = persisted.state.profiles[ALPHA.id];
  const mods = [
    {
      ...alpha.mods[0],
      installedVpks: ["pak01_dir.vpk", "pak02_dir.vpk"],
    },
    { ...alpha.mods[1], name: RESET_LOCAL_NAME },
    {
      ...fixtureMod(RESET_DISABLED_MOD, 4),
      status: ModStatus.Downloaded,
      installedVpks: [],
      installOrder: 2,
    },
  ];
  alpha.mods = mods;
  await writeFile(
    storePath,
    JSON.stringify({
      "local-config": JSON.stringify({
        ...persisted,
        state: { ...persisted.state, localMods: mods },
      }),
    }),
  );
};
