import type { ProfileBackup } from "@deadlock-mods/shared";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { FixtureRoute } from "./fixture-server";
import { catalogVpk } from "./gamebanana-fixtures";
import { readPersistedDocument } from "./observations";
import { ALPHA, BETA, prepareInstalledProfiles } from "./profile-fixtures";
import {
  SHARE_MODS,
  SHARED_LOAD_ORDER,
  shareRoutes,
} from "./profile-share-fixtures";
import { collectFileInventory, type CreatedWorld } from "./world";

export const RESTORE_BACKUP_ID = "e2e-variant-backup";
export const RESTORE_BACKUP_NAME = "E2E variant 2";
export const REPLACED_MOD_ID = "920003";
export const OLD_VARIANT_FILES = ["charlie-base.vpk", "charlie-old-extra.vpk"];

export const profileRestoreRoutes = async () => {
  const base = await shareRoutes();
  return (origin: string): FixtureRoute[] => {
    const routes = base(origin);
    const backup: ProfileBackup = {
      id: RESTORE_BACKUP_ID,
      name: RESTORE_BACKUP_NAME,
      deviceName: "E2E other PC",
      modCount: SHARE_MODS.length,
      skippedLocalModCount: 0,
      contentHash: "e2e-variant-2",
      revision: 1,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
      payload: {
        version: "1",
        profile: {
          version: "3",
          payload: {
            mods: SHARE_MODS.map((mod) => ({
              remoteId: mod.id,
              submissionType: "mod",
              selectedDownloads: mod.archives
                .filter((archive) => archive.shared)
                .map((archive) => {
                  const route = routes.find(
                    (entry) => entry.path === `/dl/${archive.id}`,
                  );
                  if (!route)
                    throw new Error(`No fixture download for ${archive.name}`);
                  return {
                    remoteId: mod.id,
                    file: archive.name,
                    url: `${origin}/dl/${archive.id}`,
                    size: route.body.length,
                  };
                }),
            })),
            loadOrder: SHARED_LOAD_ORDER,
          },
        },
        modGroups: [],
        skippedLocalModCount: 0,
      },
    };
    return [
      ...routes,
      { method: "GET", path: "/health", status: 200, body: '{"status":"ok"}' },
      {
        method: "GET",
        path: "/api/auth/oauth2/userinfo",
        status: 200,
        body: JSON.stringify({ sub: "e2e-restore-user", name: "E2E Player" }),
      },
      {
        method: "GET",
        path: "/api/v2/profile-backups",
        status: 200,
        body: JSON.stringify([backup]),
      },
      {
        method: "GET",
        path: `/api/v2/profile-backups/${backup.id}`,
        status: 200,
        body: JSON.stringify(backup),
      },
    ];
  };
};

/** Charlie has two old enabled files and a parked variant ahead of the other mods. */
export const prepareProfileRestoreWorld = async (world: CreatedWorld) => {
  await prepareInstalledProfiles(
    world,
    [
      {
        profile: ALPHA,
        modIds: [REPLACED_MOD_ID, "920001", "920002"],
        slots: [1, 3, 4],
        payload: (id) =>
          catalogVpk(
            id === REPLACED_MOD_ID
              ? OLD_VARIANT_FILES[0]
              : id === "920001"
                ? "alpha.vpk"
                : "bravo.vpk",
          ),
      },
      { profile: BETA, modIds: ["local-restore-sentinel"] },
    ],
    ALPHA.id,
  );
  const folder = path.join(
    world.configuration.roots.game,
    "game/citadel/addons",
    ALPHA.folder,
  );
  await writeFile(
    path.join(folder, "pak02_dir.vpk"),
    catalogVpk(OLD_VARIANT_FILES[1]),
  );
  await writeFile(
    path.join(folder, `${REPLACED_MOD_ID}_charlie-alt.vpk`),
    catalogVpk("charlie-alt.vpk"),
  );
  const manifestPath = path.join(folder, ".dmm.json");
  const manifest = z
    .looseObject({
      mods: z.record(
        z.string(),
        z.looseObject({
          currentVpks: z.array(z.string()),
          originalVpkNames: z.array(z.string()),
        }),
      ),
    })
    .parse(JSON.parse(await readFile(manifestPath, "utf8")));
  manifest.mods[REPLACED_MOD_ID].currentVpks = [
    "pak01_dir.vpk",
    "pak02_dir.vpk",
  ];
  manifest.mods[REPLACED_MOD_ID].originalVpkNames = OLD_VARIANT_FILES;
  manifest.mods["920001"].originalVpkNames = ["alpha.vpk"];
  manifest.mods["920002"].originalVpkNames = ["bravo.vpk"];
  await writeFile(manifestPath, JSON.stringify(manifest));

  const storedMod = z.looseObject({ remoteId: z.string() });
  const persisted = z
    .object({
      version: z.number(),
      state: z.looseObject({
        profiles: z.record(
          z.string(),
          z.looseObject({ mods: z.array(storedMod) }),
        ),
      }),
    })
    .parse(await readPersistedDocument(world.directory));
  const profile = persisted.state.profiles[ALPHA.id];
  profile.mods = profile.mods.map((mod, index) => ({
    ...mod,
    name: SHARE_MODS.find((entry) => entry.id === mod.remoteId)?.name,
    remoteUrl: `https://gamebanana.com/mods/${mod.remoteId}`,
    downloadable: true,
    installedVpks:
      mod.remoteId === REPLACED_MOD_ID
        ? ["pak01_dir.vpk", "pak02_dir.vpk"]
        : [`pak${String(index + 2).padStart(2, "0")}_dir.vpk`],
  }));
  // Authentication is a prerequisite, not the operation under test. All tokens
  // and responses belong to this disposable world's loopback server.
  await writeFile(
    path.join(world.configuration.roots.appData, "state.json"),
    JSON.stringify({
      auth_token: JSON.stringify({
        accessToken: "e2e-restore-token",
        refreshToken: "",
        expiresAt: Date.now() + 86_400_000,
      }),
      "local-config": JSON.stringify({
        ...persisted,
        state: {
          ...persisted.state,
          localMods: profile.mods,
          experimentalFeatures: { "cloud-backup": true },
          experimentalTourDismissed: true,
        },
      }),
    }),
  );
  await writeFile(
    path.join(world.artifactsDirectory, "restore-beta-initial.json"),
    JSON.stringify(
      await collectFileInventory(
        path.join(
          world.configuration.roots.game,
          "game/citadel/addons",
          BETA.folder,
        ),
      ),
    ),
  );
};

/** The mod startup looks up before it syncs the active profile. */
export const LATE_METADATA_MOD_ID = "920002";
const LATE_METADATA_MS = 8_000;

/**
 * Startup reconciles the active profile before it syncs it, and looks up a mod
 * the library lost. That lookup answers late once, so a test can act between
 * the reconciliation's read of the profile and the sync's.
 */
export const profileRestoreDuringSyncRoutes = async () => {
  const base = await profileRestoreRoutes();
  return (origin: string): FixtureRoute[] =>
    base(origin).map((route) =>
      route.path === `/apiv11/Mod/${LATE_METADATA_MOD_ID}/ProfilePage`
        ? {
            ...route,
            sequence: [
              {
                status: route.status,
                body: route.body,
                headerDelayMs: LATE_METADATA_MS,
                repeat: 1,
              },
              { status: route.status, body: route.body },
            ],
          }
        : route,
    );
};

/** The restore world, with Bravo in the manifest but not in the library. */
export const prepareProfileRestoreDuringSyncWorld = async (
  world: CreatedWorld,
) => {
  await prepareProfileRestoreWorld(world);
  const statePath = path.join(world.configuration.roots.appData, "state.json");
  const stored = z
    .object({ "local-config": z.string() })
    .loose()
    .parse(JSON.parse(await readFile(statePath, "utf8")));
  const config = z
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
    })
    .loose()
    .parse(JSON.parse(stored["local-config"]));
  const keep = (mod: { remoteId: string }) =>
    mod.remoteId !== LATE_METADATA_MOD_ID;
  config.state.localMods = config.state.localMods.filter(keep);
  const alpha = config.state.profiles[ALPHA.id];
  alpha.mods = alpha.mods.filter(keep);
  await writeFile(
    statePath,
    JSON.stringify({ ...stored, "local-config": JSON.stringify(config) }),
  );
};
