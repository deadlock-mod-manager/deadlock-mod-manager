import { afterEach, expect, it } from "bun:test";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { z } from "zod";
import type { VpkManifest } from "../../src/types/profiles";
import { type FixtureRequest, startFixtureServer } from "./fixture-server";
import {
  MULTIPAK_MODS,
  assertMultipakUpdateNetwork,
  assertUpdateRoutingNetwork,
  multipakUpdateRoutes,
  multipakVpk,
} from "./multipak-update-fixtures";
import { assertMultipakDisk } from "./multipak-update-oracle";
import { createWorld, removeOwnedWorld } from "./world";

const worlds: string[] = [];
afterEach(async () => {
  for (const world of worlds.splice(0)) await removeOwnedWorld(world);
});

it("serves distinct v1/v2 archives and requires both real update transfers", async () => {
  const server = await startFixtureServer(await multipakUpdateRoutes());
  try {
    for (const mod of MULTIPAK_MODS) {
      for (const version of ["v1", "v2"] as const) {
        if (version === "v1")
          await (
            await fetch(`${server.origin}/apiv11/Mod/${mod.id}/DownloadPage`)
          ).arrayBuffer();
        const metadata = z
          .object({
            _aFiles: z.array(
              z.object({
                _sDownloadUrl: z.string(),
                _nFilesize: z.number(),
              }),
            ),
          })
          .parse(
            await (
              await fetch(`${server.origin}/apiv11/Mod/${mod.id}/DownloadPage`)
            ).json(),
          );
        const {
          _aFiles: [{ _sDownloadUrl: downloadUrl, _nFilesize: size }],
        } = metadata;
        const response = await fetch(downloadUrl);
        const bytes = await response.arrayBuffer();
        expect(bytes.byteLength).toBe(size);
        const zip = await JSZip.loadAsync(bytes);
        expect(Object.keys(zip.files).sort()).toEqual(
          mod.versions[version].toSorted(),
        );
        for (const name of mod.versions[version])
          expect(await zip.file(name)?.async("nodebuffer")).toEqual(
            multipakVpk(mod.id, version, name),
          );
      }
    }
    assertMultipakUpdateNetwork(
      "gamebanana-multipak-update",
      server.requests(),
    );
    await (
      await fetch(`${server.origin}/dl/${MULTIPAK_MODS[0].id}/v2`)
    ).arrayBuffer();
    expect(() =>
      assertMultipakUpdateNetwork(
        "gamebanana-multipak-update",
        server.requests(),
      ),
    ).toThrow();
    expect(server.unmatchedRequests()).toHaveLength(0);
  } finally {
    await server.close();
  }
});

const replayRequests = async (urls: string[]) => {
  const server = await startFixtureServer(await multipakUpdateRoutes());
  try {
    for (const url of urls)
      await (await fetch(`${server.origin}${url}`)).arrayBuffer();
    expect(server.unmatchedRequests()).toHaveLength(0);
    return server.requests();
  } finally {
    await server.close();
  }
};
const verifyRouting = (requests: readonly FixtureRequest[]) =>
  assertUpdateRoutingNetwork("gamebanana-update-routing", requests);

it("requires the fileserver directory for the Automatic update and download only", async () => {
  const [a, b] = MULTIPAK_MODS;
  const fileservers = "/apiv11/Util/Fileservers?_nPage=1";
  verifyRouting(
    await replayRequests([
      `/dl/${a.id}/v1`,
      fileservers,
      `/dl/${a.id}/v2`,
      fileservers,
      `/dl/${b.id}/v1`,
    ]),
  );
  // An update that ignores the preference leaves only the new download's lookup.
  const ignored = await replayRequests([
    `/dl/${a.id}/v1`,
    `/dl/${a.id}/v2`,
    fileservers,
    `/dl/${b.id}/v1`,
  ]);
  expect(() => verifyRouting(ignored)).toThrow(
    "Automatic routing must reach the update",
  );
});

const prepareOracle = async () => {
  const world = await createWorld({
    runId: "multipak-oracle",
    caseId: "gamebanana-multipak-update",
    attempt: 1,
    fixtureOrigin: "http://127.0.0.1:43123",
  });
  worlds.push(world.directory);
  const addons = path.join(
    world.configuration.roots.game,
    "game",
    "citadel",
    "addons",
  );
  const mods = MULTIPAK_MODS.map((mod, index) => ({
    remoteId: mod.id,
    name: mod.name,
    status: "installed",
    selectedDownloads: [
      { name: mod.archive, url: `gamebanana-file://${mod.id}/${mod.id}` },
    ],
    installedVpks: mod.versions.v2.map(
      (_, fileIndex) => `pak0${index * 2 + fileIndex + 1}_dir.vpk`,
    ),
    installedFileTree: {
      files: mod.versions.v2.map((name) => ({
        name,
        path: name,
        archive_name: mod.archive,
        is_selected: true,
      })),
      total_files: 2,
      has_multiple_files: true,
    },
  }));
  const manifest: VpkManifest = {
    version: 3,
    mods: Object.fromEntries(
      mods.map((mod) => [
        mod.remoteId,
        {
          enabled: true,
          shard: 1,
          currentVpks: mod.installedVpks,
          disabledVpks: [],
          originalVpkNames: mod.installedFileTree.files.map(
            (file) => file.name,
          ),
        },
      ]),
    ),
  };
  await writeFile(path.join(addons, ".dmm.json"), JSON.stringify(manifest));
  const state = {
    localMods: mods,
    activeProfileId: "default",
    profiles: {
      default: {
        folderName: null,
        mods,
        enabledMods: Object.fromEntries(
          mods.map((mod) => [mod.remoteId, { enabled: true }]),
        ),
      },
    },
  };
  await writeFile(
    path.join(world.configuration.roots.appData, "state.json"),
    JSON.stringify({
      "local-config": JSON.stringify({
        state,
      }),
    }),
  );
  for (const mod of mods)
    for (const [index, name] of mod.installedFileTree.files.entries())
      await writeFile(
        path.join(addons, mod.installedVpks[index]),
        multipakVpk(mod.remoteId, "v2", name.name),
      );
  await assertMultipakDisk(world.directory, "valid", {
    version: "v2",
    a: "enabled",
  });
  return { world, addons, manifest, state };
};

it("accepts reconciled disabled membership but rejects an enabled entry for disabled files", async () => {
  const { world, addons, manifest, state } = await prepareOracle();
  const mod = state.localMods[0];
  const entry = manifest.mods[mod.remoteId];
  for (const [index, current] of entry.currentVpks.entries())
    await rename(
      path.join(addons, current),
      path.join(addons, `${mod.remoteId}_${entry.originalVpkNames[index]}`),
    );
  entry.enabled = false;
  entry.disabledVpks = entry.originalVpkNames.map(
    (name) => `${mod.remoteId}_${name}`,
  );
  entry.currentVpks = [];
  mod.status = "downloaded";
  mod.installedVpks = [];
  delete state.profiles.default.enabledMods[mod.remoteId];
  await writeFile(path.join(addons, ".dmm.json"), JSON.stringify(manifest));
  const persist = () =>
    writeFile(
      path.join(world.configuration.roots.appData, "state.json"),
      JSON.stringify({ "local-config": JSON.stringify({ state }) }),
    );
  await persist();
  await assertMultipakDisk(world.directory, "disabled-reconciled", {
    version: "v2",
    a: "disabled",
  });
  state.profiles.default.enabledMods[mod.remoteId] = { enabled: false };
  await persist();
  await assertMultipakDisk(world.directory, "disabled-explicit", {
    version: "v2",
    a: "disabled",
  });
  state.profiles.default.enabledMods[mod.remoteId] = { enabled: true };
  await persist();
  await expect(
    assertMultipakDisk(world.directory, "disabled-mismatch", {
      version: "v2",
      a: "disabled",
    }),
  ).rejects.toThrow("library and manifest agree");
});

it("rejects stale v1 files and records an expected/actual inventory diff", async () => {
  const { world, addons } = await prepareOracle();
  await writeFile(
    path.join(addons, "pak05_dir.vpk"),
    multipakVpk("930001", "v1", "a-removed.vpk"),
  );
  await expect(
    assertMultipakDisk(world.directory, "stale", {
      version: "v2",
      a: "enabled",
    }),
  ).rejects.toThrow("exact addon inventory");
  const evidence = z
    .object({
      expected: z.object({ inventory: z.array(z.string()) }),
      actual: z.object({
        inventory: z.array(z.string()),
        files: z.record(z.string(), z.string()),
      }),
    })
    .parse(
      JSON.parse(
        await readFile(
          path.join(world.artifactsDirectory, "multipak-stale.json"),
          "utf8",
        ),
      ),
    );
  expect(evidence.expected.inventory).toHaveLength(4);
  expect(evidence.actual.inventory).toHaveLength(5);
  expect(evidence.actual.files["pak05_dir.vpk"]).toBeDefined();
});

it("rejects another mod's bytes even with an otherwise consistent manifest", async () => {
  const { world, addons } = await prepareOracle();
  await writeFile(
    path.join(addons, "pak01_dir.vpk"),
    multipakVpk("930002", "v2", "b-base.vpk"),
  );
  await expect(
    assertMultipakDisk(world.directory, "wrong-owner", {
      version: "v2",
      a: "enabled",
    }),
  ).rejects.toThrow("manifest ownership and SHA-256 payloads");
});

it("rejects missing manifest files and overlapping ownership", async () => {
  const { world, addons, manifest } = await prepareOracle();
  await unlink(path.join(addons, "pak01_dir.vpk"));
  await expect(
    assertMultipakDisk(world.directory, "missing", {
      version: "v2",
      a: "enabled",
    }),
  ).rejects.toThrow("every file has exactly one owner");
  await writeFile(
    path.join(addons, "pak01_dir.vpk"),
    multipakVpk("930001", "v2", "a-base.vpk"),
  );
  manifest.mods["930002"].currentVpks[0] = "pak02_dir.vpk";
  await writeFile(path.join(addons, ".dmm.json"), JSON.stringify(manifest));
  await expect(
    assertMultipakDisk(world.directory, "overlap", {
      version: "v2",
      a: "enabled",
    }),
  ).rejects.toThrow("every file has exactly one owner");
});
