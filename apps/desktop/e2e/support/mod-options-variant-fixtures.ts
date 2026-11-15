import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { LocalMod, ModDownloadItem } from "../../src/types/mods";
import { createArchive } from "./archive-fixtures";
import type { FixtureRequest, FixtureRoute } from "./fixture-server";
import { BULK_UPDATE_FIELDS } from "./gamebanana-fixtures";
import { readCatalogState } from "./gamebanana-oracle";
import { fixtureMod } from "./mod-fixtures";
import {
  fingerprint,
  observeUntil,
  readPersistedDocument,
} from "./observations";
import { ALPHA, prepareInstalledProfiles } from "./profile-fixtures";
import { buildSyntheticVpk } from "./vpk";
import {
  assertOwnedWorld,
  collectFileInventory,
  type CreatedWorld,
} from "./world";

export const OPTIONS_MOD = { id: "930124", name: "E2E Missing Variants" };
export const BASE_FILE = `${OPTIONS_MOD.id}.vpk`;
export const FALLBACK_FILE = "fallback.vpk";
export const OVERSIZE_FILE = "oversize.vpk";
export const CHECKSUM_FILE = "checksum.vpk";
const MAX_BYTES = 2_147_483_648;
const variants = [
  { id: 9301240, name: BASE_FILE, archive: "base.zip" },
  { id: 9301241, name: FALLBACK_FILE, archive: "fallback.zip" },
  { id: 9301242, name: OVERSIZE_FILE, archive: "oversize.zip" },
  { id: 9301243, name: CHECKSUM_FILE, archive: "checksum.zip" },
];
const payload = (name: string, content = "expected") =>
  buildSyntheticVpk([
    {
      path: "scripts/e2e-missing-variant.txt",
      contents: `${name}/${content}\n`,
    },
  ]);
const archiveBodies = () =>
  Promise.all(
    variants.map((variant) =>
      createArchive({ [variant.name]: payload(variant.name) }),
    ),
  );

export const prepareModOptionsVariantWorld = async (world: CreatedWorld) => {
  await prepareInstalledProfiles(
    world,
    [
      {
        profile: ALPHA,
        modIds: [OPTIONS_MOD.id],
        payload: () => payload(BASE_FILE),
      },
    ],
    ALPHA.id,
  );
  const persisted = z
    .object({ state: z.record(z.string(), z.json()), version: z.number() })
    .parse(await readPersistedDocument(world.directory));
  const bodies = await archiveBodies();
  const downloads: ModDownloadItem[] = variants.map((variant, index) => ({
    name: variant.archive,
    url: `gamebanana-file://${OPTIONS_MOD.id}/${variant.id}`,
    size: bodies[index].length,
    createdAt: new Date(0),
    updatedAt: null,
    md5Checksum: createHash("md5").update(bodies[index]).digest("hex"),
  }));
  const mod: LocalMod = {
    ...fixtureMod(OPTIONS_MOD.id, 0),
    name: OPTIONS_MOD.name,
    remoteUrl: `https://gamebanana.com/mods/${OPTIONS_MOD.id}`,
    downloadable: true,
    downloadedAt: new Date(0),
    downloads,
    selectedDownloads: downloads,
    activeVariantArchive: "base.zip",
    installedFileTree: {
      files: variants.map((variant) => ({
        name: variant.name,
        path: variant.name,
        size: payload(variant.name).length,
        is_selected: variant.name === BASE_FILE,
        archive_name: variant.archive,
      })),
      total_files: variants.length,
      has_multiple_files: true,
    },
  };
  const profile = {
    id: ALPHA.id,
    name: ALPHA.name,
    folderName: ALPHA.folder,
    isDefault: false,
    createdAt: new Date(0),
    mods: [mod],
    enabledMods: {
      [OPTIONS_MOD.id]: {
        remoteId: OPTIONS_MOD.id,
        enabled: true,
        lastModified: new Date(0),
      },
    },
  };
  await writeFile(
    path.join(world.configuration.roots.appData, "state.json"),
    JSON.stringify({
      "local-config": JSON.stringify({
        ...persisted,
        state: {
          ...persisted.state,
          localMods: [mod],
          profiles: { [ALPHA.id]: profile },
          fileserverPreference: "default",
          autoUpdateEnabled: false,
        },
      }),
    }),
  );
  const source = path.join(
    world.configuration.roots.appData,
    "mods",
    OPTIONS_MOD.id,
  );
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, BASE_FILE), payload(BASE_FILE));
};

export const modOptionsVariantRoutes = async () => {
  const bodies = await archiveBodies();
  // A valid ZIP with the same VPK name: without checksum verification it installs.
  const wrongChecksum = await createArchive({
    [CHECKSUM_FILE]: payload(CHECKSUM_FILE, "tampered"),
  });
  return (origin: string): FixtureRoute[] => {
    const files = variants.map((variant, index) => ({
      _idRow: variant.id,
      _sFile: variant.archive,
      _nFilesize:
        variant.name === OVERSIZE_FILE ? MAX_BYTES + 1 : bodies[index].length,
      _sDownloadUrl:
        variant.name === FALLBACK_FILE
          ? `${origin}/variant-primary/${variant.id}`
          : `${origin}/dl/${variant.id}`,
      _tsDateAdded: 1_780_000_000,
      _sMd5Checksum: createHash("md5").update(bodies[index]).digest("hex"),
    }));
    return [
      {
        method: "GET",
        path: "/Core/Item/Data",
        status: 200,
        query: { "fields[]": BULK_UPDATE_FIELDS, "itemid[]": OPTIONS_MOD.id },
        body: JSON.stringify([
          [
            `https://gamebanana.com/mods/${OPTIONS_MOD.id}`,
            1_780_000_000,
            files,
          ],
        ]),
      },
      {
        method: "GET",
        path: `/apiv11/Mod/${OPTIONS_MOD.id}/DownloadPage`,
        status: 200,
        body: JSON.stringify({ _aFiles: files }),
      },
      {
        method: "GET",
        path: "/apiv11/Util/Fileservers",
        status: 200,
        body: JSON.stringify({ _aRecords: [] }),
      },
      {
        method: "GET",
        path: `/variant-primary/${variants[1].id}`,
        status: 404,
        body: "Primary archive unavailable",
      },
      ...variants.map((variant, index): FixtureRoute => {
        const route: FixtureRoute = {
          method: "GET",
          path: `/dl/${variant.id}`,
          status: 200,
          body:
            variant.name === OVERSIZE_FILE
              ? Buffer.alloc(0)
              : variant.name === CHECKSUM_FILE
                ? wrongChecksum
                : bodies[index],
        };
        if (variant.name === OVERSIZE_FILE)
          route.headers = { "content-length": String(MAX_BYTES + 1) };
        return route;
      }),
    ];
  };
};

export const assertModOptionsVariantNetwork = (
  _id: string,
  requests: readonly FixtureRequest[],
) => {
  const transfers = requests.filter(
    (request) =>
      request.url.startsWith("/dl/") ||
      request.url.startsWith("/variant-primary/"),
  );
  assert.deepEqual(
    transfers.map((request) => [request.url, request.responseStatus]),
    [
      [`/variant-primary/${variants[1].id}`, 404],
      [`/dl/${variants[1].id}`, 200],
      [`/dl/${variants[2].id}`, 200],
      [`/dl/${variants[3].id}`, 200],
    ],
  );
  assert.ok(transfers.every((request) => request.headers.range === undefined));
  assert.equal(
    transfers[2].responseBytes,
    0,
    "The size cap needs no oversized body",
  );
};

export const assertModOptionsVariantDisk = async (
  world: string,
  checkpoint: string,
  fallback: "absent" | "installed" | "parked",
) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const selected =
    fallback === "installed" ? [BASE_FILE, FALLBACK_FILE] : [BASE_FILE];
  const state = await observeUntil(
    "missing variant selection persisted",
    () => readCatalogState(world),
    (value) =>
      JSON.stringify(
        value.localMods[0]?.installedFileTree?.files
          .filter((file) => file.is_selected)
          .map((file) => file.name),
      ) === JSON.stringify(selected),
  );
  assert.equal(state.localMods.length, 1);
  const mod = state.localMods[0];
  assert.equal(mod.remoteId, OPTIONS_MOD.id);
  assert.equal(mod.status, "installed");
  assert.equal(
    state.profiles[ALPHA.id].enabledMods[OPTIONS_MOD.id]?.enabled,
    true,
  );
  assert.deepEqual(
    mod.installedFileTree?.files.map((file) => file.name),
    variants.map((variant) => variant.name),
  );
  const profileMods = z
    .object({
      state: z.object({
        profiles: z.record(
          z.string(),
          z.object({
            mods: z.array(
              z.object({
                remoteId: z.string(),
                status: z.string(),
                installedVpks: z.array(z.string()),
                installedFileTree: z.object({
                  files: z.array(
                    z.object({ name: z.string(), is_selected: z.boolean() }),
                  ),
                }),
              }),
            ),
          }),
        ),
      }),
    })
    .parse(await readPersistedDocument(world));
  const mirrored = profileMods.state.profiles[ALPHA.id].mods;
  assert.equal(mirrored.length, 1);
  assert.equal(mirrored[0].remoteId, OPTIONS_MOD.id);
  assert.equal(mirrored[0].status, "installed");
  assert.deepEqual(mirrored[0].installedVpks, mod.installedVpks);
  assert.deepEqual(
    mirrored[0].installedFileTree.files
      .filter((file) => file.is_selected)
      .map((file) => file.name),
    selected,
  );
  const directory = path.join(
    roots.game,
    "game",
    "citadel",
    "addons",
    ALPHA.folder,
  );
  const manifest = z
    .object({
      version: z.literal(3),
      mods: z.record(
        z.string(),
        z.object({
          enabled: z.boolean(),
          currentVpks: z.array(z.string()),
          disabledVpks: z.array(z.string()),
          originalVpkNames: z.array(z.string()),
        }),
      ),
    })
    .parse(
      JSON.parse(await readFile(path.join(directory, ".dmm.json"), "utf8")),
    );
  assert.deepEqual(Object.keys(manifest.mods), [OPTIONS_MOD.id]);
  const entry = manifest.mods[OPTIONS_MOD.id];
  assert.equal(entry.enabled, true);
  assert.deepEqual(entry.originalVpkNames, selected);
  assert.deepEqual(entry.currentVpks, mod.installedVpks);
  assert.deepEqual(entry.disabledVpks, []);
  const inventory = await collectFileInventory(directory);
  const parked = `${OPTIONS_MOD.id}_${FALLBACK_FILE}`;
  assert.deepEqual(
    Object.keys(inventory).sort(),
    [
      ".dmm.json",
      "protected.txt",
      ...entry.currentVpks,
      ...(fallback === "parked" ? [parked] : []),
    ].sort(),
  );
  for (const [index, name] of selected.entries()) {
    assert.deepEqual(
      await readFile(path.join(directory, entry.currentVpks[index])),
      payload(name),
    );
  }
  if (fallback === "parked")
    assert.deepEqual(
      await readFile(path.join(directory, parked)),
      payload(FALLBACK_FILE),
    );
  const sources = await collectFileInventory(
    path.join(roots.appData, "mods", OPTIONS_MOD.id),
  );
  assert.deepEqual(sources, { [BASE_FILE]: fingerprint(payload(BASE_FILE)) });
  // WebView and model-workspace scratch files share this root. Check download
  // artifacts by name without opening the model workspace's live session lock.
  const temporary = (
    await readdir(roots.temporary, { recursive: true, withFileTypes: true })
  )
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path
        .relative(roots.temporary, path.join(entry.parentPath, entry.name))
        .replaceAll("\\", "/"),
    );
  assert.deepEqual(
    temporary.filter((name) => /\.(?:zip|vpk)(?:$|[./])/.test(name)),
    [],
    "Failed variants must leave no staged archive, VPK or partial file",
  );
  await writeFile(
    path.join(world, "artifacts", `mod-options-${checkpoint}.json`),
    JSON.stringify({ state, manifest, inventory, sources, temporary }, null, 2),
  );
};
