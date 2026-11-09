import { readFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { $ } from "@wdio/globals";
import { z } from "zod";
import { readHealth, readRepairState } from "./fixed-status";
import { observeUntil } from "./observations";
import {
  CHOICES,
  LOAD_ORDER,
  REINSTALLED_MOD,
  REINSTALLED_PAYLOAD,
} from "./reinstall-choices-fixtures";
import { readShardStore } from "./shard-oracle";
import { navigate } from "./ui";
import { assertOwnedWorld } from "./world";

// Probes for the cases where Reinstall or Nuke & Reinstall must give a mod
// back the choices the player made for it.

const profileDirectory = async (world: string) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  return path.join(roots.game, "game", "citadel", "addons", CHOICES.folder);
};

const manifestSchema = z.object({
  mods: z.record(
    z.string(),
    z.object({
      enabled: z.boolean(),
      compatibilityEnabled: z.boolean().optional(),
      compatibilityOptedOut: z.boolean().optional(),
      order: z.number().nullable().optional(),
      currentVpks: z.array(z.string()),
    }),
  ),
});

const readManifest = async (world: string) =>
  manifestSchema.parse(
    JSON.parse(
      await readFile(
        path.join(await profileDirectory(world), ".dmm.json"),
        "utf8",
      ),
    ),
  ).mods;

/** The mod's saved choices, its health and repair, and the engine's order. */
export const observe = async (world: string) => {
  const manifest = await readManifest(world);
  const entry = manifest[REINSTALLED_MOD];
  // One shard and one VPK per mod: the pak number is the load order.
  const loadOrder = Object.entries(manifest)
    .filter(([, mod]) => mod.enabled && mod.currentVpks.length > 0)
    .sort(([, a], [, b]) => a.currentVpks[0].localeCompare(b.currentVpks[0]))
    .map(([id]) => id);
  const vpk = entry?.currentVpks[0];
  return {
    choice: {
      compatibilityEnabled: entry?.compatibilityEnabled ?? false,
      compatibilityOptedOut: entry?.compatibilityOptedOut ?? false,
    },
    order: entry?.order ?? null,
    health: (await readHealth(CHOICES.folder))[REINSTALLED_MOD] ?? null,
    repaired: (
      await readRepairState(world, CHOICES.folder)
    ).repairedMods.includes(REINSTALLED_MOD),
    loadOrder,
    bytesInPlace: vpk
      ? (await readFile(path.join(await profileDirectory(world), vpk))).equals(
          REINSTALLED_PAYLOAD,
        )
      : false,
  };
};

type Observation = Awaited<ReturnType<typeof observe>>;

export const FIXED: Observation = {
  choice: { compatibilityEnabled: true, compatibilityOptedOut: false },
  order: 0,
  health: "fixed",
  repaired: true,
  loadOrder: LOAD_ORDER,
  bytesInPlace: true,
};
export const ORIGINAL_FILES: Observation = {
  ...FIXED,
  choice: { compatibilityEnabled: false, compatibilityOptedOut: true },
  health: "originalFiles",
  repaired: false,
};

/**
 * Health and the repair package catch up after an install. On a miss, returns
 * the last state for the case to record and assert.
 */
export const settle = (world: string, expected: Observation) =>
  observeUntil(
    "choices settled",
    () => observe(world),
    (state) => isDeepStrictEqual(state, expected),
    10_000,
  ).catch(() => observe(world));

export const openModPage = async () => {
  await navigate("mods");
  await $(`[title="${REINSTALLED_MOD}"]`).click();
};

export const alertStatus = async () => {
  await openModPage();
  const alert = await $('[data-testid="mod-health-alert"]');
  await alert.waitForDisplayed();
  return alert.getAttribute("data-status");
};

/** Waits until the mod is installed and enabled again. */
export const reinstalled = (world: string) =>
  observeUntil(
    "reinstall settled",
    () => readShardStore(world),
    (state) =>
      state.localMods.find((mod) => mod.remoteId === REINSTALLED_MOD)
        ?.status === "installed" &&
      state.profiles[state.activeProfileId].enabledMods[REINSTALLED_MOD]
        ?.enabled === true,
    30_000,
  );
