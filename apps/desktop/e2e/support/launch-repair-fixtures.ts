import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { createArchive } from "./archive-fixtures";
import type { FixtureRoute } from "./fixture-server";
import { BULK_UPDATE_FIELDS } from "./gamebanana-fixtures";
import { readPersistedDocument } from "./observations";
import { ALPHA, BETA, prepareInstalledProfiles } from "./profile-fixtures";
import { buildSyntheticVpk } from "./vpk";
import type { CreatedWorld } from "./world";

/**
 * Two enabled GameBanana mods whose VPKs were deleted while DMM was closed.
 * The first always downloads again; in the partial case the second's download
 * is gone for good.
 */
export const REPAIR_MODS = [
  { id: "950001", name: "E2E Repairable Mod", archive: "repairable.zip" },
  { id: "950002", name: "E2E Unrepairable Mod", archive: "unrepairable.zip" },
] as const;
export const [REPAIRABLE, UNREPAIRABLE] = REPAIR_MODS;

export const repairPayload = (modId: string) =>
  buildSyntheticVpk([
    { path: "scripts/e2e-launch-repair.txt", contents: `${modId}\n` },
  ]);

const timestamp = 1_780_000_000;
const fileId = (modId: string) => Number(modId) + 10_000;
const downloadUrl = (origin: string, modId: string) =>
  `${origin}/dl/${fileId(modId)}`;

const repairArchives = () =>
  Promise.all(
    REPAIR_MODS.map(async (mod) => ({
      ...mod,
      body: await createArchive({ [`${mod.id}.vpk`]: repairPayload(mod.id) }),
    })),
  );

const json = (
  route: string,
  body: z.infer<ReturnType<typeof z.json>>,
): FixtureRoute => ({
  method: "GET",
  path: route,
  status: 200,
  body: JSON.stringify(body),
});

export const launchRepairRoutes = async (scenario: string) => {
  const archives = await repairArchives();
  return (origin: string): FixtureRoute[] => {
    const files = archives.map((mod) => ({
      _idRow: fileId(mod.id),
      _sFile: mod.archive,
      _nFilesize: mod.body.length,
      _sDownloadUrl: downloadUrl(origin, mod.id),
      _tsDateAdded: timestamp,
      _sMd5Checksum: createHash("md5").update(mod.body).digest("hex"),
    }));
    return [
      // No updates, so automatic checks leave both mods alone.
      {
        ...json(
          "/Core/Item/Data",
          archives.map((mod, index) => [
            `https://gamebanana.com/mods/${mod.id}`,
            timestamp,
            [files[index]],
          ]),
        ),
        query: { "fields[]": BULK_UPDATE_FIELDS },
      },
      json("/apiv11/Util/Fileservers", { _aRecords: [] }),
      ...archives.flatMap((mod, index): FixtureRoute[] => [
        json(`/apiv11/Mod/${mod.id}/DownloadPage`, { _aFiles: [files[index]] }),
        {
          method: "GET",
          path: `/dl/${fileId(mod.id)}`,
          ...(mod.id === UNREPAIRABLE.id &&
          scenario === "missing-vpks-launch-partial"
            ? { status: 404, body: "File removed by the author" }
            : { status: 200, body: mod.body }),
        },
      ]),
    ];
  };
};

const documentSchema = z.object({
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
});

/**
 * Seeds both mods as installed GameBanana downloads in Alpha, keeps their
 * downloaded copies (so startup flags them as broken instead of dropping them)
 * and deletes their VPKs from the profile.
 */
export const prepareLaunchRepairWorld = async (
  world: CreatedWorld,
  origin: string,
): Promise<void> => {
  const { roots } = world.configuration;
  await prepareInstalledProfiles(
    world,
    [
      {
        profile: ALPHA,
        modIds: REPAIR_MODS.map((mod) => mod.id),
        payload: repairPayload,
      },
      { profile: BETA, modIds: [] },
    ],
    ALPHA.id,
  );
  const archives = await repairArchives();
  const remote = (mod: { remoteId: string }) => {
    const source = archives.find((item) => item.id === mod.remoteId);
    assert(source);
    const download = {
      name: source.archive,
      url: downloadUrl(origin, source.id),
      size: source.body.length,
      md5Checksum: createHash("md5").update(source.body).digest("hex"),
      createdAt: null,
      updatedAt: null,
    };
    return {
      ...mod,
      name: source.name,
      remoteUrl: `https://gamebanana.com/mods/${source.id}`,
      downloadable: true,
      downloads: [download],
      selectedDownloads: [download],
    };
  };
  const document = documentSchema.parse(
    await readPersistedDocument(world.directory),
  );
  const { state } = document;
  const alpha = state.profiles[ALPHA.id];
  await writeFile(
    path.join(roots.appData, "state.json"),
    JSON.stringify({
      "local-config": JSON.stringify({
        ...document,
        state: {
          ...state,
          localMods: state.localMods.map(remote),
          profiles: {
            ...state.profiles,
            [ALPHA.id]: { ...alpha, mods: alpha.mods.map(remote) },
          },
        },
      }),
    }),
  );
  const addons = path.join(
    roots.game,
    "game",
    "citadel",
    "addons",
    ALPHA.folder,
  );
  for (const [index, mod] of REPAIR_MODS.entries()) {
    const files = path.join(roots.appData, "mods", mod.id, "files");
    await mkdir(files, { recursive: true });
    await writeFile(path.join(files, `${mod.id}.vpk`), repairPayload(mod.id));
    await rm(
      path.join(addons, `pak${String(index + 1).padStart(2, "0")}_dir.vpk`),
    );
  }
};
