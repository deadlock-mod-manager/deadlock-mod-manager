import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  CASUAL_PROFILE,
  CASUAL_PROFILE_KEY,
  GRIMOIRE_SKIN_FILE_ID,
  type GrimoireFixtureMod,
  grimoireFixtureMods,
  grimoireUserData,
  lateLocalMod,
  LINKED_OVERFLOW_ID,
  LINKED_OVERFLOW_NAME,
  LOADOUT_PROFILE,
  LOADOUT_PROFILE_KEY,
  PRESET_CROSSHAIR,
  PROFILE_CROSSHAIR,
} from "./interchange-fixtures";
import { readPersistedDocument } from "./observations";
import { assertOwnedWorld, collectFileInventory } from "./world";

const localModSchema = z.object({
  remoteId: z.string(),
  name: z.string(),
  status: z.string(),
  installOrder: z.number().optional(),
  installedVpks: z.array(z.string()).optional(),
  missingVpks: z.array(z.string()).optional(),
  selectedDownloads: z.array(z.object({ url: z.string() })).optional(),
});
const crosshairSchema = z.object({
  gap: z.number(),
  pipGapStatic: z.boolean(),
  color: z.object({ r: z.number(), g: z.number(), b: z.number() }),
});
const stateSchema = z.object({
  state: z.object({
    localMods: z.array(localModSchema),
    activeProfileId: z.string(),
    activeCrosshair: crosshairSchema.nullable().optional(),
    activeCrosshairHistory: z.array(crosshairSchema).optional(),
    profiles: z.record(
      z.string(),
      z.object({
        name: z.string(),
        folderName: z.string().nullable(),
        mods: z.array(localModSchema),
        enabledMods: z.record(z.string(), z.object({ enabled: z.boolean() })),
      }),
    ),
  }),
});
const manifestSchema = z.object({
  version: z.literal(3),
  mods: z.record(
    z.string(),
    z.object({
      enabled: z.boolean(),
      shard: z.number(),
      order: z.number().nullable(),
      currentVpks: z.array(z.string()),
      disabledVpks: z.array(z.string()),
      originalVpkNames: z.array(z.string()),
    }),
  ),
});
type Manifest = z.infer<typeof manifestSchema>;

export const readInterchangeState = async (world: string) =>
  stateSchema.parse(await readPersistedDocument(world)).state;

const fingerprint = (bytes: Buffer) =>
  `${bytes.length}:${createHash("sha256").update(bytes).digest("hex")}`;

/** Mirrors `import.rs::dmm_mod_id`: GameBanana ids map directly, local keys
 *  get a UUID derived from the key so re-imports resolve to the same mod. */
export const derivedModId = (mod: GrimoireFixtureMod): string => {
  const [provider, type, id] = mod.key.split(":");
  if (provider === "gamebanana") return type === "sound" ? `snd-${id}` : id;
  const hash = createHash("sha256").update(mod.key).digest("hex");
  return `local-${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
};

/** The id each fixture mod ends up with after the user linked the overflow
 *  mod to its GameBanana page. */
export const finalModId = (mod: GrimoireFixtureMod, index: number): string =>
  index === 2 ? LINKED_OVERFLOW_ID : derivedModId(mod);

const finalName = (mod: GrimoireFixtureMod, index: number) =>
  index === 2 ? LINKED_OVERFLOW_NAME : mod.name;

const readManifest = async (dir: string): Promise<Manifest> =>
  manifestSchema.parse(
    JSON.parse(await readFile(path.join(dir, ".dmm.json"), "utf8")),
  );

const ledgerSchema = z.object({
  entries: z.record(z.string(), z.string()),
  profiles: z.record(z.string(), z.string()),
});

const readLedger = async (appData: string) =>
  ledgerSchema.parse(
    JSON.parse(
      await readFile(path.join(appData, "interchange-ledger.json"), "utf8"),
    ),
  );

const assertGrimoireUntouched = async (world: string, snapshot: string) => {
  const before = z
    .record(z.string(), z.string())
    .parse(
      JSON.parse(
        await readFile(path.join(world, "artifacts", snapshot), "utf8"),
      ),
    );
  assert.deepEqual(
    await collectFileInventory(grimoireUserData(world)),
    before,
    "Grimoire's settings, profiles and metadata stay byte-identical",
  );
};

export const assertGrimoireImported = async (
  world: string,
  step: string,
): Promise<void> => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const state = await readInterchangeState(world);
  const active = state.profiles[state.activeProfileId];
  assert.ok(active, "Active profile must exist");
  assert.equal(
    active.folderName,
    null,
    "Library goes into the default profile",
  );

  const citadel = path.join(roots.game, "game", "citadel");
  const addons = path.join(citadel, "addons");
  const manifest = await readManifest(addons);
  const inventory = await collectFileInventory(addons);
  const fixtures = grimoireFixtureMods(roots.game);
  const ids = fixtures.map(finalModId);

  // --- Library in the active profile -------------------------------------
  assert.deepEqual(
    active.mods.map((mod) => mod.remoteId).sort(),
    [...ids].sort(),
    "Every Grimoire mod is in the library once",
  );
  assert.deepEqual(Object.keys(manifest.mods).sort(), [...ids].sort());
  for (const [order, fixture] of fixtures.entries()) {
    const modId = ids[order];
    const mod = active.mods.find((entry) => entry.remoteId === modId);
    assert.ok(mod, `${fixture.name} must be in the library`);
    assert.equal(mod.name, finalName(fixture, order));
    assert.equal(mod.installOrder, order, `${fixture.name} keeps load order`);
    assert.equal(mod.status, fixture.enabled ? "installed" : "downloaded");
    const entry = manifest.mods[modId];
    assert.equal(entry.enabled, fixture.enabled);
    assert.equal(entry.order, order);
    const files = fixture.enabled ? entry.currentVpks : entry.disabledVpks;
    assert.equal(files.length, 1, `${fixture.name} owns exactly one VPK`);
    assert.equal(inventory[files[0]], fingerprint(fixture.bytes));
    if (fixture.enabled) {
      assert.match(files[0], /^pak\d{2}_dir\.vpk$/);
      assert.deepEqual(mod.installedVpks, files);
      assert.equal(active.enabledMods[modId]?.enabled, true);
    } else {
      assert.deepEqual(files, [`${modId}_e2e_parked_sound_dir.vpk`]);
    }
    const store = await collectFileInventory(
      path.join(roots.appData, "mods", modId, "files"),
    );
    assert.deepEqual(Object.values(store), [fingerprint(fixture.bytes)]);
  }
  assert.deepEqual(
    fixtures
      .filter((f) => f.enabled)
      .map((f) => manifest.mods[ids[fixtures.indexOf(f)]].currentVpks[0]),
    ["pak01_dir.vpk", "pak02_dir.vpk", "pak03_dir.vpk"],
  );
  const skin = active.mods.find((mod) => mod.remoteId === ids[0]);
  assert.deepEqual(
    skin?.selectedDownloads?.map((download) => download.url),
    [`gamebanana-file://${ids[0]}/${GRIMOIRE_SKIN_FILE_ID}`],
  );
  // Other profiles keep their files in their own addons subfolders.
  const profileFolders = Object.values(state.profiles).flatMap((profile) =>
    profile.folderName ? [`${profile.folderName}/`] : [],
  );
  assert.deepEqual(
    Object.keys(inventory)
      .filter(
        (file) => !profileFolders.some((folder) => file.startsWith(folder)),
      )
      .sort(),
    [
      ".dmm.json",
      ".disabled/e2e_parked_sound_dir.vpk",
      "pak01_dir.vpk",
      "pak02_dir.vpk",
      "pak03_dir.vpk",
      `${ids[3]}_e2e_parked_sound_dir.vpk`,
    ].sort(),
    "No stray files in the default profile",
  );

  // --- Linking replaced the local identity everywhere ----------------------
  const oldOverflowId = derivedModId(fixtures[2]);
  for (const profile of Object.values(state.profiles)) {
    assert.ok(
      !profile.mods.some((mod) => mod.remoteId === oldOverflowId),
      `${profile.name} still references the unlinked local id`,
    );
  }
  assert.deepEqual(
    await collectFileInventory(path.join(roots.appData, "mods", oldOverflowId)),
    {},
  );
  const ledger = await readLedger(roots.appData);
  assert.equal(ledger.entries[fixtures[2].key], LINKED_OVERFLOW_ID);

  // --- Profiles ------------------------------------------------------------
  const byName = (name: string) => {
    const found = Object.values(state.profiles).find((p) => p.name === name);
    assert.ok(found, `Profile ${name} must exist`);
    assert.ok(found.folderName, `${name} must have its own folder`);
    return found as typeof found & { folderName: string };
  };
  assert.equal(Object.keys(state.profiles).length, 2);

  const loadout = byName(LOADOUT_PROFILE);
  const loadoutDir = path.join(addons, loadout.folderName);
  const loadoutManifest = await readManifest(loadoutDir);
  assert.deepEqual(
    Object.keys(loadoutManifest.mods).sort(),
    [ids[0], ids[3]].sort(),
  );
  // The sound is disabled in the library but enabled in this profile.
  assert.equal(loadoutManifest.mods[ids[3]].enabled, true);
  assert.equal(loadoutManifest.mods[ids[0]].enabled, true);
  assert.equal(loadout.enabledMods[ids[3]]?.enabled, true);
  const loadoutFiles = await collectFileInventory(loadoutDir);
  assert.equal(
    loadoutFiles[loadoutManifest.mods[ids[3]].currentVpks[0]],
    fingerprint(fixtures[3].bytes),
  );

  // Grimoire's "Default Profile" went into DMM's default profile, which
  // already held its only mod, and the ledger points a re-import there too.
  const casual = state.profiles.default;
  assert.equal(casual?.name, CASUAL_PROFILE);
  assert.ok(
    casual.mods.some((mod) => mod.remoteId === LINKED_OVERFLOW_ID),
    `${CASUAL_PROFILE} must hold the linked overflow mod`,
  );
  assert.equal(ledger.profiles[CASUAL_PROFILE_KEY], "default");

  // --- Crosshairs ----------------------------------------------------------
  const history = state.activeCrosshairHistory ?? [];
  const matches = (
    crosshair: z.infer<typeof crosshairSchema>,
    expected: {
      pipGap: number;
      colorR: number;
      colorG: number;
      colorB: number;
    },
  ) =>
    crosshair.gap === expected.pipGap &&
    crosshair.color.r === expected.colorR &&
    crosshair.color.g === expected.colorG &&
    crosshair.color.b === expected.colorB;
  assert.ok(history.some((c) => matches(c, PROFILE_CROSSHAIR)));
  assert.ok(history.some((c) => matches(c, PRESET_CROSSHAIR)));
  assert.ok(
    state.activeCrosshair && matches(state.activeCrosshair, PRESET_CROSSHAIR),
  );
  assert.equal(state.activeCrosshair?.pipGapStatic, true);

  // --- Grimoire keeps working ----------------------------------------------
  const overflow = fixtures[2];
  assert.equal(
    (await collectFileInventory(path.dirname(overflow.sourcePath)))[
      path.basename(overflow.sourcePath)
    ],
    fingerprint(overflow.bytes),
  );
  assert.equal(
    inventory[".disabled/e2e_parked_sound_dir.vpk"],
    fingerprint(fixtures[3].bytes),
  );
  await assertGrimoireUntouched(world, "grimoire-before.json");
  assert.equal(
    await readFile(path.join(roots.game, "protected.txt"), "utf8"),
    "Grimoire import must not touch this\n",
  );

  await writeFile(
    path.join(world, "artifacts", `interchange-${step}.json`),
    JSON.stringify({ state, manifest, inventory }, null, 2),
  );
};

export const assertGrimoireReimported = async (
  world: string,
  step: string,
): Promise<void> => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const state = await readInterchangeState(world);
  const addons = path.join(roots.game, "game", "citadel", "addons");
  const fixtures = grimoireFixtureMods(roots.game);
  const ids = fixtures.map(finalModId);
  const late = lateLocalMod(roots.game);
  const lateId = derivedModId(late);
  const ledger = await readLedger(roots.appData);

  assert.deepEqual(
    Object.values(state.profiles)
      .map((profile) => profile.name)
      .sort(),
    [CASUAL_PROFILE, LOADOUT_PROFILE].sort(),
    "Re-import must not create duplicate profiles",
  );
  const loadoutEntry = Object.entries(state.profiles).find(
    ([, profile]) => profile.name === LOADOUT_PROFILE,
  );
  assert.ok(loadoutEntry, "Loadout profile must still exist");
  const [loadoutId, loadout] = loadoutEntry;
  assert.ok(loadout.folderName, "Loadout keeps its folder");
  assert.equal(
    ledger.profiles[LOADOUT_PROFILE_KEY],
    loadoutId,
    "The renamed Grimoire profile returns to its original DMM profile",
  );
  assert.equal(ledger.profiles[CASUAL_PROFILE_KEY], "default");

  const active = state.profiles.default;
  assert.ok(active, "Default profile must exist");
  const expected = [...ids, lateId].sort();
  assert.deepEqual(
    active.mods.map((mod) => mod.remoteId).sort(),
    expected,
    "Moved and swapped files must not return as duplicate mods",
  );
  const manifest = await readManifest(addons);
  assert.deepEqual(Object.keys(manifest.mods).sort(), expected);
  const inventory = await collectFileInventory(addons);
  // The fixture swapped two slots: each mod must still own its own bytes.
  for (const [index, fixture] of fixtures.entries()) {
    const entry = manifest.mods[ids[index]];
    const files = entry.enabled ? entry.currentVpks : entry.disabledVpks;
    assert.equal(files.length, 1, `${fixture.name} owns exactly one VPK`);
    assert.equal(inventory[files[0]], fingerprint(fixture.bytes));
    assert.deepEqual(
      active.mods.find((mod) => mod.remoteId === ids[index])?.installedVpks ??
        [],
      entry.enabled ? files : [],
      `${fixture.name} keeps its library paths aligned with the manifest`,
    );
    const store = await collectFileInventory(
      path.join(roots.appData, "mods", ids[index], "files"),
    );
    assert.deepEqual(Object.values(store), [fingerprint(fixture.bytes)]);
  }
  assert.equal(manifest.mods[lateId].enabled, false);
  assert.equal(
    inventory[manifest.mods[lateId].disabledVpks[0]],
    fingerprint(late.bytes),
  );

  const loadoutDir = path.join(addons, loadout.folderName);
  const loadoutManifest = await readManifest(loadoutDir);
  assert.deepEqual(
    Object.keys(loadoutManifest.mods).sort(),
    [ids[0], ids[3], lateId].sort(),
  );
  const lateInLoadout = loadoutManifest.mods[lateId];
  assert.equal(
    loadout.enabledMods[lateId]?.enabled === true,
    lateInLoadout.enabled,
  );
  const lateLoadoutVpk = lateInLoadout.enabled
    ? lateInLoadout.currentVpks[0]
    : lateInLoadout.disabledVpks[0];
  assert.equal(
    (await collectFileInventory(loadoutDir))[lateLoadoutVpk],
    fingerprint(late.bytes),
  );
  assert.deepEqual(
    Object.values(
      await collectFileInventory(
        path.join(roots.appData, "mods", lateId, "files"),
      ),
    ),
    [fingerprint(late.bytes)],
  );

  assert.equal(
    (await collectFileInventory(path.join(addons, ".disabled")))[
      `${ids[3]}_e2e_parked_sound_dir.vpk`
    ],
    fingerprint(fixtures[3].bytes),
  );
  await assertGrimoireUntouched(world, "grimoire-before-reimport.json");

  await writeFile(
    path.join(world, "artifacts", `interchange-${step}.json`),
    JSON.stringify({ state, manifest, loadoutManifest }, null, 2),
  );
};
