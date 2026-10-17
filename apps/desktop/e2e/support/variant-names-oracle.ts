import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { readCatalogState } from "./gamebanana-oracle";
import { fingerprint } from "./observations";
import {
  VARIANT_MOD,
  VARIANT_SOURCE_NAME,
  VARIANTS,
  variantVpk,
  type VariantVersion,
} from "./variant-names-fixtures";
import { assertOwnedWorld, collectFileInventory } from "./world";

const manifestSchema = z.object({
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
});

type VariantName = (typeof VARIANTS)[number]["name"];
export type VariantExpectation = Partial<
  Record<VariantName, { state: "enabled" | "parked"; version: VariantVersion }>
>;

const readAddons = async (world: string) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const addons = path.join(roots.game, "game", "citadel", "addons");
  return {
    manifest: manifestSchema.parse(
      JSON.parse(await readFile(path.join(addons, ".dmm.json"), "utf8")),
    ),
    inventory: await collectFileInventory(addons),
  };
};

const payload = (name: VariantName, version: VariantVersion) => {
  const variant = VARIANTS.find((item) => item.name === name);
  assert(variant);
  return fingerprint(variantVpk(variant.archive, version));
};

/** Whether the variant's installed copy holds that version's bytes. */
export const hasInstalledVersion = async (
  world: string,
  name: VariantName,
  version: VariantVersion,
) => {
  const { manifest, inventory } = await readAddons(world);
  const entry = manifest.mods[VARIANT_MOD.id];
  const index = entry?.originalVpkNames.indexOf(name) ?? -1;
  return (
    index >= 0 && inventory[entry.currentVpks[index]] === payload(name, version)
  );
};

export const assertVariantDisk = async (
  world: string,
  checkpoint: string,
  expected: VariantExpectation,
) => {
  const state = await readCatalogState(world);
  const { manifest, inventory } = await readAddons(world);
  const entries = Object.entries(expected);
  const enabled = entries.filter(([, item]) => item.state === "enabled");
  const parked = entries.filter(([, item]) => item.state === "parked");
  const entry = manifest.mods[VARIANT_MOD.id];
  const local = state.localMods.find((mod) => mod.remoteId === VARIANT_MOD.id);
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
  check("one enabled manifest entry", () => {
    assert.deepEqual(Object.keys(manifest.mods), [VARIANT_MOD.id]);
    assert.equal(entry?.enabled, true);
    assert.deepEqual(entry?.disabledVpks, []);
  });
  check("enabled variants keep their own names and bytes", () => {
    assert(entry);
    assert.deepEqual(
      entry.originalVpkNames.toSorted(),
      enabled.map(([name]) => name).sort(),
    );
    assert.equal(entry.currentVpks.length, entry.originalVpkNames.length);
    for (const name of entry.currentVpks)
      assert.match(name, /^pak\d{2}_dir\.vpk$/);
    assert.deepEqual(
      Object.fromEntries(
        entry.originalVpkNames.map((name, index) => [
          name,
          inventory[entry.currentVpks[index]] ?? null,
        ]),
      ),
      Object.fromEntries(
        enabled.map(([name, item]) => [
          name,
          payload(name as VariantName, item.version),
        ]),
      ),
    );
  });
  check("exact addon inventory", () => {
    assert(entry);
    assert.deepEqual(
      Object.keys(inventory).sort(),
      [
        ".dmm.json",
        ...entry.currentVpks,
        ...parked.map(([name]) => `${VARIANT_MOD.id}_${name}`),
      ].sort(),
    );
    for (const [name, item] of parked)
      assert.equal(
        inventory[`${VARIANT_MOD.id}_${name}`],
        payload(name as VariantName, item.version),
        `Wrong parked bytes for ${name}`,
      );
  });
  check("library tree names every variant apart", () => {
    assert(local);
    assert.equal(local.status, "installed");
    assert.deepEqual(local.installedVpks, entry?.currentVpks);
    assert.deepEqual(
      local.selectedDownloads.map((download) => download.name).sort(),
      VARIANTS.map((variant) => variant.archive).sort(),
    );
    const files = local.installedFileTree?.files ?? [];
    assert.deepEqual(
      files.map((file) => [file.archive_name, file.name]).sort(),
      VARIANTS.map((variant) => [variant.archive, variant.name]).sort(),
    );
    for (const file of files)
      assert.equal(path.posix.basename(file.path), VARIANT_SOURCE_NAME);
    assert.deepEqual(
      files
        .filter((file) => file.is_selected)
        .map((file) => file.name)
        .sort(),
      enabled.map(([name]) => name).sort(),
    );
    assert.equal(
      state.profiles[state.activeProfileId].enabledMods[VARIANT_MOD.id]
        ?.enabled,
      true,
    );
  });
  await writeFile(
    path.join(world, "artifacts", `variant-names-${checkpoint}.json`),
    JSON.stringify({ expected, state, manifest, inventory, failures }, null, 2),
  );
  assert.equal(
    failures.length,
    0,
    `Variant names failed at ${checkpoint}\n${failures.join("\n")}`,
  );
};
