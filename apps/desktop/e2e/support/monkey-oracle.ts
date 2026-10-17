import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { filesystemManifestSchema } from "./filesystem-oracle";
import { readPersistedDocument, fingerprint } from "./observations";
import { ALPHA, BETA, profilePayload } from "./profile-fixtures";
import {
  MULTIPAK_MODS,
  multipakVpk,
  type MultipakVersion,
} from "./multipak-update-fixtures";
import { readGameinfoSearchPaths } from "./shard-oracle";
import { assertOwnedWorld, collectFileInventory } from "./world";

const modSchema = z.object({
  remoteId: z.string(),
  name: z.string(),
  status: z.string(),
  installedVpks: z.array(z.string()).nullish(),
  missingVpks: z.array(z.string()).default([]),
  installedFileTree: z
    .object({
      files: z.array(
        z.object({
          path: z.string(),
          archive_name: z.string(),
        }),
      ),
    })
    .optional(),
});
export const readMonkeyStore = async (world: string) =>
  z
    .object({
      state: z.object({
        activeProfileId: z.string(),
        localMods: z.array(modSchema),
        profiles: z.record(
          z.string(),
          z.object({
            folderName: z.string().nullable(),
            mods: z.array(modSchema),
            enabledMods: z.record(
              z.string(),
              z.object({ enabled: z.boolean() }),
            ),
          }),
        ),
      }),
    })
    .parse(await readPersistedDocument(world)).state;

export type MonkeyModel = Record<
  string,
  Record<
    string,
    {
      enabled: boolean;
      version: MultipakVersion;
    }
  >
>;
export const monkeyPaths = async (world: string) => {
  const { configuration } = await assertOwnedWorld(world);
  const citadel = path.join(configuration.roots.game, "game", "citadel");
  const state = await readMonkeyStore(world);
  const folder = state.profiles[state.activeProfileId].folderName;
  assert(folder);
  return {
    configuration,
    citadel,
    state,
    folder,
    base: path.join(citadel, "addons", folder),
  };
};

export const readMonkeyManifest = async (base: string) =>
  filesystemManifestSchema.parse(
    JSON.parse(await readFile(path.join(base, ".dmm.json"), "utf8")),
  );

const assertNoStaging = async (root: string): Promise<void> => {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    assert.doesNotMatch(
      entry.name,
      /staging|\.dmm-reorder/i,
      `Leftover transaction directory in ${root}`,
    );
    await assertNoStaging(path.join(root, entry.name));
  }
};

export const assertMonkeyInvariants = async (
  world: string,
  label: string,
  model: MonkeyModel,
  external: ReadonlySet<string>,
  missing: ReadonlySet<string> = new Set(),
  launch?: "modded" | "vanilla",
) => {
  const { configuration, citadel, state } = await monkeyPaths(world);
  const disk = await collectFileInventory(citadel);
  const observations = [];
  const searchPaths = await readGameinfoSearchPaths(world);
  try {
    for (const file of external)
      assert(disk[file], `External VPK disappeared before Repair: ${file}`);
    for (const profile of [ALPHA, BETA]) {
      const manifest = await readMonkeyManifest(
        path.join(citadel, "addons", profile.folder),
      );
      observations.push({ profile: profile.id, manifest });
      const stored = state.profiles[profile.id];
      const expected = model[profile.id];
      assert.deepEqual(
        Object.keys(manifest.mods).sort(),
        Object.keys(expected).sort(),
        `${profile.name} manifest membership`,
      );
      assert.deepEqual(
        stored.mods.map((mod) => mod.remoteId).sort(),
        Object.keys(expected).sort(),
        `${profile.name} library membership`,
      );
      assert.deepEqual(
        Object.entries(stored.enabledMods)
          .filter(([, entry]) => entry.enabled)
          .map(([id]) => id)
          .sort(),
        Object.entries(manifest.mods)
          .filter(([, entry]) => entry.enabled)
          .map(([id]) => id)
          .sort(),
        `${profile.name} enabled membership`,
      );
      const owned = new Set<string>();
      for (const [id, entry] of Object.entries(manifest.mods)) {
        assert.equal(
          entry.enabled,
          expected[id].enabled,
          `${id} enabled state`,
        );
        const filenames = entry.enabled
          ? entry.currentVpks
          : entry.disabledVpks;
        assert.deepEqual(
          entry.enabled ? entry.disabledVpks : entry.currentVpks,
          [],
          `${id} inactive locators`,
        );
        const remote = MULTIPAK_MODS.find((mod) => mod.id === id);
        const originals = remote
          ? remote.versions[expected[id].version]
          : [`${id}.vpk`];
        assert.deepEqual(
          entry.originalVpkNames.toSorted(),
          originals.toSorted(),
          `${id} original VPK set`,
        );
        assert.equal(filenames.length, originals.length, `${id} file count`);
        for (const [index, filename] of filenames.entries()) {
          const root =
            entry.enabled && entry.shard > 1
              ? `addons${entry.shard}`
              : "addons";
          const relative = `${root}/${profile.folder}/${filename}`;
          assert(!owned.has(relative), `Duplicate manifest owner: ${relative}`);
          owned.add(relative);
          if (missing.has(relative) && disk[relative] === undefined) continue;
          const original = entry.originalVpkNames[index];
          const bytes = remote
            ? multipakVpk(id, expected[id].version, original)
            : profilePayload(id);
          assert.equal(
            disk[relative],
            fingerprint(bytes),
            `${id}: missing or wrong payload at ${relative}`,
          );
        }
        const mod = stored.mods.find((item) => item.remoteId === id);
        assert(mod);
        assert.equal(
          mod.status,
          entry.enabled ? "installed" : "downloaded",
          `${id} store status`,
        );
        assert.equal(
          stored.enabledMods[id]?.enabled ?? false,
          entry.enabled,
          `${id} profile enablement`,
        );
        assert.deepEqual(
          (mod.installedVpks ?? []).toSorted(),
          entry.currentVpks.toSorted(),
          `${id} store locators`,
        );
      }
      const vpks = Object.keys(disk).filter(
        (file) =>
          /^addons\d*\//.test(file) &&
          file.split("/")[1] === profile.folder &&
          file.endsWith(".vpk"),
      );
      for (const file of vpks)
        assert(owned.has(file) || external.has(file), `Unowned VPK: ${file}`);
      for (const file of external)
        assert(
          !owned.has(file),
          `External VPK became tracked before Repair: ${file}`,
        );
      if (state.activeProfileId === profile.id) {
        assert.deepEqual(
          state.localMods,
          stored.mods,
          "Both active library copies agree",
        );
        if (launch === "modded") {
          const highest = Math.max(
            1,
            ...Object.values(manifest.mods)
              .filter((entry) => entry.enabled)
              .map((entry) => entry.shard),
          );
          assert.deepEqual(
            searchPaths,
            Array.from(
              { length: highest },
              (_, index) =>
                `citadel/${index === 0 ? "addons" : `addons${index + 1}`}/${profile.folder}`,
            ),
            "Modded launch search paths",
          );
        }
      }
    }
    if (launch === "vanilla")
      assert.deepEqual(searchPaths, [], "Vanilla launch search paths");
    await assertNoStaging(configuration.roots.game);
    await assertNoStaging(configuration.roots.appData);
    const origin = configuration.endpoints[0].origin;
    const network = z
      .object({ unmatched: z.array(z.json()) })
      .parse(await (await fetch(`${origin}/__control/requests`)).json());
    assert.deepEqual(network.unmatched, [], "Unexpected HTTP requests");
  } finally {
    await writeFile(
      path.join(world, "artifacts", `monkey-state-${label}.json`),
      JSON.stringify(
        {
          state,
          disk,
          manifests: observations,
          model,
          external: [...external],
          missing: [...missing],
          searchPaths,
        },
        null,
        2,
      ),
    );
  }
};
