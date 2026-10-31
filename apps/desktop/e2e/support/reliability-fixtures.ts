import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { SessionFingerprint } from "../../src/lib/launch-health/types";
import type { LocalMod } from "../../src/types/mods";
import { createArchive } from "./archive-fixtures";
import type { FixtureRequest, FixtureRoute } from "./fixture-server";
import {
  BULK_HYDRATION_FIELDS,
  BULK_UPDATE_FIELDS,
} from "./gamebanana-fixtures";
import { fixtureMod } from "./mod-fixtures";
import { fingerprint, readPersistedDocument } from "./observations";
import { prepareInstalledProfiles } from "./profile-fixtures";
import { buildSyntheticVpk } from "./vpk";
import {
  assertOwnedWorld,
  collectFileInventory,
  type CreatedWorld,
} from "./world";

const reliabilityCaseSchema = z.enum([
  "gamebanana-archived-files",
  "gamebanana-update-choice",
  "gamebanana-requirements",
  "gamebanana-mirror-fallback",
  "gamebanana-crash-cause",
]);
type ReliabilityCase = z.infer<typeof reliabilityCaseSchema>;
const RELIABILITY_PROFILE = {
  id: "profile_940_reliability",
  folder: "profile_940_reliability",
  name: "E2E Reliability",
};
const PRIMARY = { id: "940001", name: "E2E Reliability Mod" };
const BASE = { id: "940002", name: "E2E Required Base" };
const BLOCKED = { id: "940003", name: "E2E Incompatible Mod" };
const OLD_DATE = 1_780_000_000;
const primaryFileId = 940101;
const reliabilityPayload = (id: string, version = "original") =>
  buildSyntheticVpk([
    {
      path: "scripts/e2e-reliability.txt",
      contents: `${id}/${version}\n${"fixture-data\n".repeat(2048)}`,
    },
  ]);
const definitions = (id: ReliabilityCase) =>
  id === "gamebanana-requirements" ? [PRIMARY, BASE, BLOCKED] : [PRIMARY];
const json = <T>(url: string, body: T): FixtureRoute => ({
  method: "GET",
  path: url,
  status: 200,
  body: JSON.stringify(body),
});
const modIdSchema = z.object({
  remoteId: z.string(),
  status: z.string(),
  installedVpks: z.array(z.string()).optional(),
  selectedDownloads: z.array(z.object({ name: z.string() })).default([]),
});
const readReliabilityState = async (world: string) =>
  z
    .object({
      state: z.object({
        localMods: z.array(modIdSchema),
        activeProfileId: z.string(),
      }),
    })
    .parse(await readPersistedDocument(world)).state;

const crashFingerprint = (autoexecHash: string): SessionFingerprint => ({
  clientVersion: 1,
  steamBuildId: "fixture",
  launchArgs: [],
  condebug: true,
  autoexecHash,
  addonPaths: [
    {
      path: `citadel/addons/${RELIABILITY_PROFILE.folder}`,
      vpkCount: 1,
      digest: "fixture",
    },
  ],
  perfConfig: null,
  client: {
    profileId: RELIABILITY_PROFILE.id,
    profileName: RELIABILITY_PROFILE.name,
    mods: [
      {
        remoteId: PRIMARY.id,
        name: PRIMARY.name,
        downloadedAt: null,
        variant: null,
        enabledAt: null,
      },
    ],
  },
});
export async function prepareReliabilityWorld(world: CreatedWorld) {
  const scenario = reliabilityCaseSchema.parse(world.configuration.caseId);
  const installed =
    scenario === "gamebanana-requirements"
      ? [BLOCKED]
      : scenario === "gamebanana-mirror-fallback"
        ? []
        : [PRIMARY];
  await prepareInstalledProfiles(
    world,
    [
      {
        profile: RELIABILITY_PROFILE,
        modIds: installed.map((mod) => mod.id),
        payload: reliabilityPayload,
      },
    ],
    RELIABILITY_PROFILE.id,
  );
  const persisted = z
    .object({ state: z.record(z.string(), z.json()), version: z.number() })
    .parse(await readPersistedDocument(world.directory));
  const mods: LocalMod[] = installed.map((mod, index) =>
    Object.assign(fixtureMod(mod.id, index), {
      name: mod.name,
      remoteUrl: `https://gamebanana.com/mods/${mod.id}`,
      downloadable: true,
      downloadedAt: new Date(OLD_DATE * 1000),
      selectedDownloads: [
        {
          name: "legacy.zip",
          url: `gamebanana-file://${mod.id}/${mod === PRIMARY ? primaryFileId : Number(mod.id) + 100}`,
          size: 0,
          createdAt: new Date(OLD_DATE * 1000),
          updatedAt: null,
          md5Checksum: null,
        },
      ],
      installedFileTree: {
        files: [
          {
            name: `${mod.id}.vpk`,
            path: `${mod.id}.vpk`,
            size: reliabilityPayload(mod.id).length,
            is_selected: true,
            archive_name: "legacy.zip",
          },
        ],
        total_files: 1,
        has_multiple_files: false,
      },
    }),
  );
  const state = {
    ...persisted.state,
    localMods: mods,
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
      [RELIABILITY_PROFILE.id]: {
        id: RELIABILITY_PROFILE.id,
        name: RELIABILITY_PROFILE.name,
        folderName: RELIABILITY_PROFILE.folder,
        isDefault: false,
        createdAt: new Date(0),
        mods,
        enabledMods: Object.fromEntries(
          mods.map((mod) => [
            mod.remoteId,
            {
              remoteId: mod.remoteId,
              enabled: true,
              lastModified: new Date(0),
            },
          ]),
        ),
      },
    },
    fileserverPreference: "default",
    autoUpdateEnabled: false,
    crashCheckEnabled: true,
    lastNormalFingerprint: crashFingerprint("baseline"),
  };
  await writeFile(
    path.join(world.configuration.roots.appData, "state.json"),
    JSON.stringify({ "local-config": JSON.stringify({ ...persisted, state }) }),
  );
  for (const mod of mods) {
    const directory = path.join(
      world.configuration.roots.appData,
      "mods",
      mod.remoteId,
    );
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, `${mod.remoteId}.vpk`),
      reliabilityPayload(mod.remoteId),
    );
  }
}

// Exact ordered query lists match the provider's multicall response order.
const orderedSubsets = (values: number[]): number[][] =>
  values.flatMap((value) =>
    [[value]].concat(
      orderedSubsets(values.filter((other) => other !== value)).map((tail) =>
        [value].concat(tail),
      ),
    ),
  );

export async function reliabilityRoutes(caseId: string) {
  const scenario = reliabilityCaseSchema.parse(caseId);
  const mods = definitions(scenario);
  const archives = await Promise.all(
    mods.map((mod) =>
      createArchive({ [`${mod.id}.vpk`]: reliabilityPayload(mod.id) }),
    ),
  );
  const red = await createArchive({
    [`${PRIMARY.id}.vpk`]: reliabilityPayload(PRIMARY.id, "red"),
  });
  const blue = await createArchive({
    [`${PRIMARY.id}.vpk`]: reliabilityPayload(PRIMARY.id, "blue"),
  });
  return (origin: string): FixtureRoute[] => {
    const file = (id: number, name: string, body: Buffer, date = OLD_DATE) => ({
      _idRow: id,
      _sFile: name,
      _nFilesize: body.length,
      _sDownloadUrl: `${origin}/dl/${id}`,
      _tsDateAdded: date,
      _sMd5Checksum: createHash("md5").update(body).digest("hex"),
    });
    const files = mods.map((mod, index) => {
      if (scenario === "gamebanana-archived-files")
        return [
          file(primaryFileId + 1, "blue.zip", blue, 4_100_000_000),
          file(primaryFileId + 2, "red.zip", red, 4_100_000_000),
        ];
      if (scenario === "gamebanana-update-choice")
        return [
          file(primaryFileId, "red.zip", red, 4_100_000_000),
          file(primaryFileId + 1, "blue.zip", blue),
        ];
      const selected = file(
        mod === PRIMARY ? primaryFileId : Number(mod.id) + 100,
        "legacy.zip",
        archives[index],
      );
      if (scenario === "gamebanana-mirror-fallback")
        selected["_sDownloadUrl"] = `${origin}/mirror/${primaryFileId}`;
      return [selected];
    });
    const profiles = mods.map((mod, index) => ({
      _idRow: Number(mod.id),
      _sModelName: "Mod",
      _sName: mod.name,
      _sProfileUrl: `https://gamebanana.com/mods/${mod.id}`,
      _tsDateAdded: OLD_DATE,
      _tsDateModified: OLD_DATE,
      _bHasFiles: true,
      _sText: "Synthetic mod reliability fixture",
      _aSubmitter: { _sName: "E2E" },
      _aRootCategory: { _sName: "Skins" },
      _aCategory: { _sName: "Skins" },
      _aFiles: files[index],
      _aRequirements:
        scenario === "gamebanana-requirements" && mod === PRIMARY
          ? [
              [
                BASE.name,
                `https://gamebanana.com/mods/${BASE.id}`,
                "required",
                "enabled",
              ],
              [
                BLOCKED.name,
                `https://gamebanana.com/mods/${BLOCKED.id}`,
                "required",
                "disabled",
              ],
            ]
          : [],
    }));
    const updateRoutes = orderedSubsets(mods.map((_, index) => index))
      .sort((a, b) => b.length - a.length)
      .map(
        (indices): FixtureRoute =>
          Object.assign(
            json(
              "/Core/Item/Data",
              indices.map((index) => [
                profiles[index]["_sProfileUrl"],
                OLD_DATE,
                files[index],
              ]),
            ),
            {
              query: {
                "fields[]": indices.map(() => BULK_UPDATE_FIELDS),
                "itemid[]": indices.map((index) => mods[index].id),
              },
            },
          ),
      );
    const routes: FixtureRoute[] = [
      json("/apiv11/Mod/Index", {
        _aMetadata: {
          _nRecordCount: mods.length,
          _nPerpage: 50,
          _bIsComplete: true,
        },
        _aRecords: profiles,
      }),
      {
        ...json(
          "/Core/Item/Data",
          profiles.map((profile) => [
            profile["_sName"],
            0,
            "Skins",
            "Skins",
            profile["_sText"],
            profile["_sText"],
            profile["_aFiles"],
          ]),
        ),
        query: { "fields[]": BULK_HYDRATION_FIELDS },
      },
      ...updateRoutes,
      json("/apiv11/Util/Fileservers", { _aRecords: [] }),
    ];
    mods.forEach((mod, index) =>
      routes.push(
        json(`/apiv11/Mod/${mod.id}/ProfilePage`, profiles[index]),
        json(`/apiv11/Mod/${mod.id}/DownloadPage`, { _aFiles: files[index] }),
        json(`/apiv11/Mod/${mod.id}/Updates`, {
          _aMetadata: { _nRecordCount: 0, _nPerpage: 10, _bIsComplete: true },
          _aRecords: [],
        }),
        json(`/api/v2/reports/mod/${mod.id}/counts`, {
          total: 0,
          open: 0,
          resolved: 0,
          dismissed: 0,
        }),
      ),
    );
    if (scenario === "gamebanana-update-choice")
      routes.push(
        { method: "GET", path: `/dl/${primaryFileId}`, status: 200, body: red },
        {
          method: "GET",
          path: `/dl/${primaryFileId + 1}`,
          status: 200,
          body: blue,
        },
      );
    else if (scenario !== "gamebanana-archived-files")
      mods.forEach((mod, index) =>
        routes.push({
          method: "GET",
          path: `/dl/${mod === PRIMARY ? primaryFileId : Number(mod.id) + 100}`,
          status: 200,
          body: archives[index],
        }),
      );
    if (scenario === "gamebanana-mirror-fallback") {
      const corrupt = Buffer.from(archives[0]);
      corrupt[0] ^= 0xff;
      routes.push({
        method: "GET",
        path: `/mirror/${primaryFileId}`,
        status: 200,
        body: corrupt,
        sequence: [
          {
            status: 200,
            body: corrupt,
            range: true,
            headers: { etag: '"mirror-v1"' },
            chunkBytes: 64,
            chunkDelayMs: 25,
            disconnectAfterBytes: 128,
          },
          { status: 503, body: "Mirror went away" },
        ],
      });
    }
    return routes;
  };
}

export async function assertReliabilityDisk(
  world: string,
  expected: Record<string, string>,
  checkpoint: string,
) {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const directory = path.join(
    roots.game,
    "game/citadel/addons",
    RELIABILITY_PROFILE.folder,
  );
  const manifest = z
    .object({
      mods: z.record(
        z.string(),
        z.object({
          enabled: z.boolean(),
          currentVpks: z.array(z.string()),
          disabledVpks: z.array(z.string()),
        }),
      ),
    })
    .parse(
      JSON.parse(await readFile(path.join(directory, ".dmm.json"), "utf8")),
    );
  assert.deepEqual(
    Object.entries(manifest.mods)
      .filter(([, entry]) => entry.enabled)
      .map(([id]) => id)
      .sort(),
    Object.keys(expected).sort(),
  );
  for (const [id, version] of Object.entries(expected)) {
    const entry = manifest.mods[id];
    assert.equal(entry.currentVpks.length, 1);
    assert.equal(
      fingerprint(await readFile(path.join(directory, entry.currentVpks[0]))),
      fingerprint(reliabilityPayload(id, version)),
    );
  }
  const addonInventory = await collectFileInventory(directory);
  const claimedVpks = Object.values(manifest.mods).flatMap((entry) =>
    entry.enabled ? entry.currentVpks : entry.disabledVpks,
  );
  assert.deepEqual(
    Object.keys(addonInventory)
      .filter((name) => name.endsWith(".vpk"))
      .sort(),
    claimedVpks.toSorted(),
  );
  const persisted = await readReliabilityState(world);
  assert.equal(persisted.activeProfileId, RELIABILITY_PROFILE.id);
  for (const id of Object.keys(expected)) {
    const mod = persisted.localMods.find((entry) => entry.remoteId === id);
    assert.equal(mod?.status, "installed");
    assert.deepEqual(mod?.installedVpks, manifest.mods[id].currentVpks);
  }
  const inventory = await collectFileInventory(
    path.join(roots.appData, "mods"),
  );
  assert(
    !Object.keys(inventory).some(
      (name) => name.endsWith(".partial") || name.endsWith(".partial.meta"),
    ),
  );
  await writeFile(
    path.join(world, "artifacts", `${checkpoint}.json`),
    JSON.stringify({ manifest, inventory }),
  );
  return manifest;
}

export function assertReliabilityNetwork(
  id: string,
  requests: readonly FixtureRequest[],
) {
  const downloads = requests.filter(
    (request) =>
      request.method === "GET" &&
      (request.url.startsWith("/dl/") || request.url.startsWith("/mirror/")),
  );
  if (id === "gamebanana-mirror-fallback") {
    assert.deepEqual(
      downloads.map((request) => request.url),
      [
        `/mirror/${primaryFileId}`,
        `/mirror/${primaryFileId}`,
        `/dl/${primaryFileId}`,
      ],
    );
    assert((downloads[0].responseBytes ?? 0) > 0);
    assert.equal(downloads[1].responseStatus, 503);
    assert.equal(downloads[2].responseStatus, 200);
    assert.equal(downloads[2].headers.range, undefined);
  } else if (id === "gamebanana-update-choice")
    assert.deepEqual(
      downloads.map((request) => request.url),
      [`/dl/${primaryFileId}`],
    );
  else if (
    id === "gamebanana-archived-files" ||
    id === "gamebanana-crash-cause"
  )
    assert.deepEqual(downloads, []);
  else
    assert.deepEqual(
      downloads.map((request) => request.url),
      [`/dl/${Number(BASE.id) + 100}`, `/dl/${primaryFileId}`],
    );
}

export const reliabilityFixture = {
  PRIMARY,
  BASE,
  BLOCKED,
  RELIABILITY_PROFILE,
  crashFingerprint,
  readReliabilityState,
};
