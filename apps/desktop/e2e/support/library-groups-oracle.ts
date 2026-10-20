import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { GROUP_PROFILE_LAYOUT } from "./library-groups-fixtures";
import { fingerprint, readPersistedDocument } from "./observations";
import { ALPHA, profilePayload } from "./profile-fixtures";
import { assertOwnedWorld, collectFileInventory } from "./world";

const modSchema = z.object({
  remoteId: z.string(),
  status: z.string(),
  installOrder: z.number(),
});
export const readLibraryGroups = async (world: string) =>
  z
    .object({
      state: z.object({
        activeProfileId: z.string(),
        localMods: z.array(modSchema),
        profiles: z.record(
          z.string(),
          z.object({
            mods: z.array(modSchema),
            enabledMods: z.record(
              z.string(),
              z.object({ enabled: z.boolean() }),
            ),
            modGroups: z
              .array(
                z.object({
                  id: z.string(),
                  name: z.string(),
                  modIds: z.array(z.string()),
                  collapsed: z.boolean(),
                }),
              )
              .default([]),
          }),
        ),
      }),
    })
    .parse(await readPersistedDocument(world)).state;

export const assertLibraryGroupsDisk = async (
  world: string,
  checkpoint: string,
  disabled: readonly string[] = [],
  layout = GROUP_PROFILE_LAYOUT,
) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const state = await readLibraryGroups(world);
  for (const { profile, modIds } of layout) {
    const directory = path.join(
      roots.game,
      "game",
      "citadel",
      "addons",
      profile.folder,
    );
    const manifest = z
      .object({
        mods: z.record(
          z.string(),
          z.object({
            enabled: z.boolean(),
            order: z.number(),
            shard: z.number(),
            currentVpks: z.array(z.string()),
            disabledVpks: z.array(z.string()),
          }),
        ),
      })
      .parse(
        JSON.parse(await readFile(path.join(directory, ".dmm.json"), "utf8")),
      );
    const inventory = await collectFileInventory(directory);
    assert.deepEqual(Object.keys(manifest.mods).sort(), modIds.toSorted());
    const mods =
      state.activeProfileId === profile.id
        ? state.localMods
        : state.profiles[profile.id].mods;
    assert.deepEqual(
      mods
        .toSorted((a, b) => a.installOrder - b.installOrder)
        .map((mod) => mod.remoteId),
      modIds,
    );
    for (const [index, id] of modIds.entries()) {
      const enabled = profile.id !== ALPHA.id || !disabled.includes(id);
      const entry = manifest.mods[id];
      assert.equal(entry.enabled, enabled);
      assert.equal(entry.order, index, `Load order changed for ${id}`);
      assert.equal(entry.shard, 1);
      assert.equal(
        state.profiles[profile.id].enabledMods[id]?.enabled ?? false,
        enabled,
      );
      assert.equal(
        mods.find((mod) => mod.remoteId === id)?.status,
        enabled ? "installed" : "downloaded",
      );
      assert.equal(entry.currentVpks.length, enabled ? 1 : 0);
      assert.equal(entry.disabledVpks.length, enabled ? 0 : 1);
      for (const name of [...entry.currentVpks, ...entry.disabledVpks])
        assert.equal(
          inventory[name],
          fingerprint(profilePayload(id)),
          `VPK contents changed for ${id}`,
        );
    }
    assert.deepEqual(
      Object.keys(inventory).sort(),
      [
        ".dmm.json",
        "protected.txt",
        ...Object.values(manifest.mods).flatMap((mod) =>
          mod.currentVpks.concat(mod.disabledVpks),
        ),
      ].sort(),
    );
    assert.equal(
      inventory["protected.txt"],
      fingerprint(Buffer.from(`Protected ${profile.name}\n`)),
    );
  }
  await writeFile(
    path.join(world, "artifacts", `library-groups-${checkpoint}.json`),
    JSON.stringify(state, null, 2),
  );
};
