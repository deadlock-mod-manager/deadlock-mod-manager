import { readPersistedDocument, fingerprint } from "./observations";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ALPHA, BETA, BETA_MODS, profilePayload } from "./profile-fixtures";
import { assertOwnedWorld, collectFileInventory } from "./world";

const modSchema = z.object({
  remoteId: z.string(),
  status: z.literal("installed"),
  installOrder: z.number(),
  installedVpks: z.array(z.string()),
});
const inventorySchema = z.record(z.string(), z.string());
export const readProfileState = async (world: string) => {
  return z
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
          }),
        ),
      }),
    })
    .parse(await readPersistedDocument(world)).state;
};

export const assertProfilesDisk = async (
  world: string,
  step: string,
  activeId: string,
  alphaOrder: string[],
) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const state = await readProfileState(world);
  assert.equal(state.activeProfileId, activeId);
  const initial = z
    .object({ alpha: inventorySchema, beta: inventorySchema })
    .parse(
      JSON.parse(
        await readFile(
          path.join(world, "artifacts", "profiles-initial.json"),
          "utf8",
        ),
      ),
    );
  const inventories: Record<string, Record<string, string>> = {};
  for (const { profile, order } of [
    { profile: ALPHA, order: alphaOrder },
    { profile: BETA, order: BETA_MODS },
  ]) {
    const directory = path.join(
      roots.game,
      "game",
      "citadel",
      "addons",
      profile.folder,
    );
    const inventory = await collectFileInventory(directory);
    inventories[profile.id] = inventory;
    const manifest = z
      .object({
        version: z.literal(3),
        mods: z.record(
          z.string(),
          z.object({
            enabled: z.boolean(),
            order: z.number(),
            shard: z.number(),
            currentVpks: z.array(z.string()),
            disabledVpks: z.array(z.string()),
            originalVpkNames: z.array(z.string()),
          }),
        ),
      })
      .parse(
        JSON.parse(await readFile(path.join(directory, ".dmm.json"), "utf8")),
      );
    assert.deepEqual(Object.keys(manifest.mods).sort(), [...order].sort());
    const expectedMods = order.map((remoteId, index) => ({
      remoteId,
      status: "installed",
      installOrder: index,
      installedVpks: [`pak${String(index + 1).padStart(2, "0")}_dir.vpk`],
    }));
    assert.deepEqual(
      state.profiles[profile.id].mods.toSorted(
        (a, b) => a.installOrder - b.installOrder,
      ),
      expectedMods,
    );
    if (activeId === profile.id)
      assert.deepEqual(
        state.localMods.toSorted((a, b) => a.installOrder - b.installOrder),
        expectedMods,
      );
    assert.deepEqual(
      Object.keys(state.profiles[profile.id].enabledMods).sort(),
      order.toSorted(),
    );
    assert.deepEqual(
      Object.keys(inventory).sort(),
      [
        ".dmm.json",
        "protected.txt",
        ...expectedMods.flatMap((mod) => mod.installedVpks),
      ].sort(),
    );
    for (const mod of expectedMods) {
      const payload = profilePayload(mod.remoteId);
      assert.equal(
        inventory[mod.installedVpks[0]],
        fingerprint(payload),
        `Wrong bytes for ${mod.remoteId}`,
      );
      assert.deepEqual(manifest.mods[mod.remoteId], {
        enabled: true,
        order: mod.installOrder,
        shard: 1,
        currentVpks: mod.installedVpks,
        disabledVpks: [],
        originalVpkNames: [`${mod.remoteId}.vpk`],
      });
      assert.equal(
        state.profiles[profile.id].enabledMods[mod.remoteId].enabled,
        true,
      );
    }
    assert.equal(
      await readFile(path.join(directory, "protected.txt"), "utf8"),
      `Protected ${profile.name}\n`,
    );
  }
  assert.deepEqual(
    inventories[BETA.id],
    initial.beta,
    "Untouched profile must remain byte-identical",
  );
  const gameinfo = await readFile(
    path.join(roots.game, "game", "citadel", "gameinfo.gi"),
    "utf8",
  );
  const active = activeId === ALPHA.id ? ALPHA : BETA;
  const addonSearchPaths = [
    ...gameinfo.matchAll(/^\s*Game\s+(citadel\/addons\S*)\s*$/gm),
  ].map((match) => match[1]);
  assert.deepEqual(addonSearchPaths, [`citadel/addons/${active.folder}`]);
  await writeFile(
    path.join(world, "artifacts", `profiles-${step}.json`),
    JSON.stringify({ state, inventories, gameinfo }, null, 2),
  );
  return inventories[ALPHA.id];
};
