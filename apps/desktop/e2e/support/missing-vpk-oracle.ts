import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  ALPHA_MISSING_MODS,
  BETA_MISSING_MODS,
  MISSING,
  PAIR_SECOND_PAYLOAD,
  STORED_SOURCE,
  profileDirectory,
} from "./missing-vpk-fixtures";
import {
  fingerprint,
  inventorySchema,
  readPersistedDocument,
} from "./observations";
import { ALPHA, BETA, profilePayload } from "./profile-fixtures";
import { assertOwnedWorld, collectFileInventory } from "./world";

const modSchema = z.object({
  remoteId: z.string(),
  status: z.string(),
  installedVpks: z.array(z.string()).optional(),
  missingVpks: z.array(z.string()).optional(),
});
const profileSchema = z.object({
  mods: z.array(modSchema),
  enabledMods: z.record(z.string(), z.object({ enabled: z.boolean() })),
});
const manifestSchema = z.object({
  mods: z.record(
    z.string(),
    z.object({
      enabled: z.boolean(),
      currentVpks: z.array(z.string()),
      disabledVpks: z.array(z.string()),
    }),
  ),
});
export type MissingVpkManifest = z.infer<typeof manifestSchema>;

export type MissingVpkState = {
  localMods: z.infer<typeof modSchema>[];
  alpha: z.infer<typeof profileSchema>;
  beta: z.infer<typeof profileSchema>;
};

export const readMissingVpkState = async (
  world: string,
): Promise<MissingVpkState> => {
  const state = z
    .object({
      state: z.object({
        activeProfileId: z.string(),
        localMods: z.array(modSchema),
        profiles: z.record(z.string(), profileSchema),
      }),
    })
    .parse(await readPersistedDocument(world)).state;
  assert.equal(state.activeProfileId, ALPHA.id);
  return {
    localMods: state.localMods,
    alpha: state.profiles[ALPHA.id],
    beta: state.profiles[BETA.id],
  };
};

export const readMissingVpkManifest = async (
  world: string,
  folder: string,
): Promise<MissingVpkManifest> => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  return manifestSchema.parse(
    JSON.parse(
      await readFile(
        path.join(profileDirectory(roots.game, folder), ".dmm.json"),
        "utf8",
      ),
    ),
  );
};

const ids = (mods: readonly { remoteId: string }[]) =>
  mods.map((mod) => mod.remoteId).toSorted();

export type MissingVpkExpectation = {
  /** Alpha mods the library and manifest must still hold. */
  alpha: readonly string[];
  /** Beta mods the library and manifest must still hold. */
  beta: readonly string[];
  /** Alpha mods flagged as broken, with the original VPK names they lost. */
  broken: Readonly<Record<string, readonly string[]>>;
};

/**
 * A mod that lost only some of its files, or that DMM can restore, stays in
 * the library but is flagged with what it lost so the user can reinstall or
 * remove it. Names are the original VPK names the user would recognise.
 */
export const BROKEN: MissingVpkExpectation["broken"] = {
  [MISSING.pair]: [`${PAIR_SECOND_PAYLOAD}.vpk`],
  [MISSING.stored]: [STORED_SOURCE],
};

export const EVERY_MOD: MissingVpkExpectation = {
  alpha: ALPHA_MISSING_MODS,
  beta: BETA_MISSING_MODS,
  broken: {},
};

/** A canonical, comparable rendering of which mods are broken and why. */
const brokenSummary = (
  entries: readonly (readonly [string, readonly string[]])[],
): string =>
  JSON.stringify(
    entries
      .filter(([, missing]) => missing.length > 0)
      .map(([remoteId, missing]) => [remoteId, missing.toSorted()])
      .toSorted(([left], [right]) => String(left).localeCompare(String(right))),
  );

const brokenIn = (mods: readonly z.infer<typeof modSchema>[]) =>
  brokenSummary(mods.map((mod) => [mod.remoteId, mod.missingVpks ?? []]));

const expectedBroken = (expected: MissingVpkExpectation) =>
  brokenSummary(Object.entries(expected.broken));

/**
 * Both copies of the active library, and Beta's, hold exactly these mods,
 * flagged exactly as expected.
 */
export const holdsLibrary =
  (expected: MissingVpkExpectation) =>
  (state: MissingVpkState): boolean =>
    [state.localMods, state.alpha.mods].every(
      (mods) =>
        JSON.stringify(ids(mods)) ===
          JSON.stringify(expected.alpha.toSorted()) &&
        brokenIn(mods) === expectedBroken(expected),
    ) &&
    JSON.stringify(ids(state.beta.mods)) ===
      JSON.stringify(expected.beta.toSorted()) &&
    brokenIn(state.beta.mods) === brokenSummary([]);

/** Payload recipe of every VPK a user can delete in these scenarios. */
const PAYLOAD_OF = new Map<string, readonly string[]>([
  [MISSING.enabled, [MISSING.enabled]],
  [MISSING.parked, [MISSING.parked]],
  [MISSING.pair, [PAIR_SECOND_PAYLOAD]],
  [MISSING.stored, [MISSING.stored]],
  [MISSING.betaEnabled, [MISSING.betaEnabled]],
]);

/**
 * DMM may rename VPKs between slots and rewrites `.dmm.json`, so the disk is
 * compared by payload: what remains is exactly the seeded payloads minus the
 * ones the test deleted. Removing a mod from the library must never delete or
 * add a file on the user's behalf.
 */
const payloadsOf = (inventory: Record<string, string>): string[] =>
  Object.entries(inventory)
    .filter(([file]) => !path.posix.basename(file).startsWith(".dmm"))
    .map(([, hash]) => hash)
    .toSorted();

const payloadsAfter = (
  initial: Record<string, string>,
  deleted: readonly string[],
): string[] => {
  const remaining = payloadsOf(initial);
  for (const modId of deleted)
    for (const payload of PAYLOAD_OF.get(modId) ?? []) {
      const index = remaining.indexOf(fingerprint(profilePayload(payload)));
      assert.ok(index >= 0, `Seeded payload for ${payload} is missing`);
      remaining.splice(index, 1);
    }
  return remaining;
};

export const assertMissingVpkOutcome = async (
  world: string,
  step: string,
  expected: MissingVpkExpectation,
  deleted: { alpha: readonly string[]; beta: readonly string[] },
): Promise<void> => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const state = await readMissingVpkState(world);
  const manifests = {
    alpha: await readMissingVpkManifest(world, ALPHA.folder),
    beta: await readMissingVpkManifest(world, BETA.folder),
  };
  const inventories = {
    alpha: await collectFileInventory(
      profileDirectory(roots.game, ALPHA.folder),
    ),
    beta: await collectFileInventory(profileDirectory(roots.game, BETA.folder)),
    modsStore: await collectFileInventory(path.join(roots.appData, "mods")),
  };
  await writeFile(
    path.join(world, "artifacts", `missing-vpks-${step}.json`),
    JSON.stringify({ step, state, manifests, inventories }, null, 2),
  );

  const alpha = expected.alpha.toSorted();
  const beta = expected.beta.toSorted();
  assert.deepEqual(ids(state.localMods), alpha, `${step}: active library`);
  assert.deepEqual(ids(state.alpha.mods), alpha, `${step}: Alpha library`);
  assert.deepEqual(ids(state.beta.mods), beta, `${step}: Beta library`);
  // Dropping only the store entry is not enough: startup restores any mod the
  // manifest still lists, so a removed mod would come back on the next launch.
  assert.deepEqual(
    Object.keys(manifests.alpha.mods).toSorted(),
    alpha,
    `${step}: Alpha manifest`,
  );
  assert.deepEqual(
    Object.keys(manifests.beta.mods).toSorted(),
    beta,
    `${step}: Beta manifest`,
  );
  for (const [profile, enabledMods] of [
    ["Alpha", state.alpha.enabledMods],
    ["Beta", state.beta.enabledMods],
  ] as const) {
    const library = profile === "Alpha" ? alpha : beta;
    for (const modId of Object.keys(enabledMods))
      assert.ok(
        library.includes(modId),
        `${step}: ${profile} still enables removed ${modId}`,
      );
  }

  for (const [label, mods] of [
    ["active library", state.localMods],
    ["Alpha library", state.alpha.mods],
  ] as const)
    assert.deepEqual(
      brokenIn(mods),
      expectedBroken(expected),
      `${step}: ${label} broken mods`,
    );
  assert.equal(
    brokenIn(state.beta.mods),
    brokenSummary([]),
    `${step}: Beta broken mods`,
  );

  // The untouched mod is unaffected by its neighbours disappearing.
  const intact = state.alpha.mods.find(
    (mod) => mod.remoteId === MISSING.intact,
  );
  assert.equal(intact?.status, "installed", `${step}: intact mod status`);
  assert.deepEqual(
    intact?.installedVpks,
    manifests.alpha.mods[MISSING.intact]?.currentVpks,
    `${step}: intact mod VPKs`,
  );
  assert.ok(
    state.alpha.enabledMods[MISSING.intact]?.enabled,
    `${step}: intact mod stays enabled`,
  );

  const initial = z
    .object({
      alpha: inventorySchema,
      beta: inventorySchema,
      modsStore: inventorySchema,
    })
    .parse(
      JSON.parse(
        await readFile(
          path.join(world, "artifacts", "missing-vpks-initial.json"),
          "utf8",
        ),
      ),
    );
  assert.deepEqual(
    payloadsOf(inventories.alpha),
    payloadsAfter(initial.alpha, deleted.alpha),
    `${step}: Alpha payloads`,
  );
  assert.deepEqual(
    payloadsOf(inventories.beta),
    payloadsAfter(initial.beta, deleted.beta),
    `${step}: Beta payloads`,
  );
  // The stored import is how its mod can be enabled again; it must survive.
  assert.deepEqual(
    inventories.modsStore,
    initial.modsStore,
    `${step}: mods store`,
  );
};
