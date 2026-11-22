import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { readCatalogState } from "./gamebanana-oracle";
import {
  MULTIPAK_MODS,
  multipakVpk,
  type MultipakVersion,
} from "./multipak-update-fixtures";
import { fingerprint, readPersistedDocument } from "./observations";
import { assertOwnedWorld, collectFileInventory } from "./world";

const manifestSchema = z.object({
  version: z.literal(3),
  mods: z.record(
    z.string(),
    z.object({
      enabled: z.boolean(),
      shard: z.number(),
      currentVpks: z.array(z.string()),
      disabledVpks: z.array(z.string()),
      originalVpkNames: z.array(z.string()),
    }),
  ),
});
export type MultipakExpectation = {
  version: MultipakVersion;
  a: "enabled" | "disabled" | "deleted";
};

export const assertMultipakDisk = async (
  world: string,
  checkpoint: string,
  expected: MultipakExpectation,
) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const state = await readCatalogState(world);
  const addons = path.join(roots.game, "game", "citadel", "addons");
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(path.join(addons, ".dmm.json"), "utf8")),
  );
  const inventory = await collectFileInventory(addons);
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
                installedVpks: z.array(z.string()).optional(),
              }),
            ),
          }),
        ),
      }),
    })
    .parse(await readPersistedDocument(world)).state.profiles[
    state.activeProfileId
  ].mods;
  const mods = MULTIPAK_MODS.filter(
    (mod) => mod.id !== MULTIPAK_MODS[0].id || expected.a !== "deleted",
  );
  const expectedManifest = Object.fromEntries(
    mods.map((mod) => {
      const enabled =
        mod.id !== MULTIPAK_MODS[0].id || expected.a === "enabled";
      const payloads = Object.fromEntries(
        mod.versions[expected.version].map((name) => [
          name,
          fingerprint(multipakVpk(mod.id, expected.version, name)),
        ]),
      );
      return [mod.id, { enabled, payloads }];
    }),
  );
  const expectedPayloads = Object.values(expectedManifest)
    .flatMap((entry) => Object.values(entry.payloads))
    .sort();
  const actualManifest = Object.fromEntries(
    Object.entries(manifest.mods).map(([id, entry]) => {
      const diskNames = entry.enabled ? entry.currentVpks : entry.disabledVpks;
      return [
        id,
        {
          enabled: entry.enabled,
          payloads: Object.fromEntries(
            entry.originalVpkNames.map((name, index) => [
              name,
              inventory[diskNames[index]] ?? null,
            ]),
          ),
        },
      ];
    }),
  );
  // Other profiles live in subfolders of the default profile's addons root.
  const actualInventory = Object.fromEntries(
    Object.entries(inventory).filter(
      ([name]) => name !== ".dmm.json" && !name.includes("/"),
    ),
  );
  const failures: string[] = [];
  const check = (label: string, action: () => void) => {
    try {
      action();
    } catch (error) {
      failures.push(
        `${label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  check("manifest ownership and SHA-256 payloads", () =>
    assert.deepEqual(actualManifest, expectedManifest),
  );
  check("exact addon inventory", () =>
    assert.deepEqual(Object.values(actualInventory).sort(), expectedPayloads),
  );
  const ownedFiles = Object.values(manifest.mods).flatMap((entry) =>
    entry.currentVpks.concat(entry.disabledVpks),
  );
  check("every file has exactly one owner", () => {
    assert.equal(ownedFiles.length, new Set(ownedFiles).size);
    assert.deepEqual(
      ownedFiles.toSorted(),
      Object.keys(actualInventory).sort(),
    );
    assert.equal(
      new Set(Object.values(actualInventory)).size,
      Object.keys(actualInventory).length,
      "Duplicate VPK payloads",
    );
    assert.equal(
      ownedFiles.length,
      mods.reduce(
        (count, mod) => count + mod.versions[expected.version].length,
        0,
      ),
    );
  });
  const profile = state.profiles[state.activeProfileId];
  check("library membership", () => {
    assert.equal(profile.folderName, null);
    assert.deepEqual(
      state.localMods.map((mod) => mod.remoteId).sort(),
      mods.map((mod) => mod.id).sort(),
    );
    assert.deepEqual(
      profileMods.map((mod) => mod.remoteId).sort(),
      mods.map((mod) => mod.id).sort(),
    );
    assert.deepEqual(
      Object.entries(profile.enabledMods)
        .filter(([, entry]) => entry.enabled)
        .map(([id]) => id)
        .sort(),
      mods
        .filter(
          (mod) => mod.id !== MULTIPAK_MODS[0].id || expected.a === "enabled",
        )
        .map((mod) => mod.id)
        .sort(),
    );
  });
  for (const mod of mods)
    check(`library and manifest agree for ${mod.name}`, () => {
      const entry = manifest.mods[mod.id];
      assert(entry);
      const enabled =
        mod.id !== MULTIPAK_MODS[0].id || expected.a === "enabled";
      const files = mod.versions[expected.version].toSorted();
      assert.equal(entry.shard, 1);
      assert.deepEqual(enabled ? entry.disabledVpks : entry.currentVpks, []);
      assert.equal(
        (enabled ? entry.currentVpks : entry.disabledVpks).length,
        files.length,
      );
      if (enabled) {
        for (const name of entry.currentVpks)
          assert.match(name, /^pak\d{2}_dir\.vpk$/);
      } else {
        assert.deepEqual(
          entry.disabledVpks.toSorted(),
          files.map((name) => `${mod.id}_${name}`),
        );
      }
      assert.equal(profile.enabledMods[mod.id]?.enabled ?? false, enabled);
      const local = state.localMods.find((item) => item.remoteId === mod.id);
      assert(local);
      assert.equal(local.name, mod.name);
      assert.equal(local.status, enabled ? "installed" : "downloaded");
      assert.deepEqual(
        local.selectedDownloads.map((download) => download.name),
        [mod.archive],
      );
      assert.deepEqual(
        local.installedFileTree?.files
          .filter((file) => file.is_selected)
          .map((file) => file.name)
          .sort(),
        files,
      );
      for (const mirror of [
        local,
        profileMods.find((item) => item.remoteId === mod.id),
      ]) {
        assert(mirror);
        assert.equal(mirror.status, local.status);
        if (enabled) assert.deepEqual(mirror.installedVpks, entry.currentVpks);
      }
    });
  await writeFile(
    path.join(world, "artifacts", `multipak-${checkpoint}.json`),
    JSON.stringify(
      {
        expected: {
          ...expected,
          inventory: expectedPayloads,
          manifest: expectedManifest,
        },
        actual: {
          inventory: Object.values(actualInventory).sort(),
          files: actualInventory,
          manifest: actualManifest,
        },
        state,
        profileMods,
        manifest,
        failures,
      },
      null,
      2,
    ),
  );
  assert.equal(
    failures.length,
    0,
    `Multipak ownership failed at ${checkpoint}\n${failures.join("\n")}`,
  );
  return { state, manifest, inventory: actualInventory };
};
