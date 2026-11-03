import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { $, $$, browser } from "@wdio/globals";
import { z } from "zod";
import { observeUntil } from "./observations";
import { findMod } from "./shard-actions";
import { navigate } from "./ui";
import { assertOwnedWorld } from "./world";

// Probes for fixed-status cases. A fixed mod should keep "Fixed for this
// patch", and its repair should stay in the package the game loads, unless the
// player changes it.

type HealthReport = {
  gameBuild: number | null;
  mods: { modId: string; status: string }[];
};

/** Each mod's health status, as the backend reports it to the window. */
export const readHealth = async (
  folder: string | null,
): Promise<Record<string, string>> => {
  const report = await browser.execute(
    (profileFolder) =>
      // oxlint-disable-next-line no-underscore-dangle -- Tauri's injected IPC global.
      window.__TAURI_INTERNALS__.invoke<HealthReport>("get_mod_health", {
        profileFolder,
      }),
    folder,
  );
  return Object.fromEntries(
    report.mods.map((health) => [health.modId, health.status]),
  );
};

const receiptSchema = z.object({
  revision: z.number(),
  key: z.object({ history_digest: z.string().nullable().optional() }),
  resolutions: z.array(z.looseObject({})),
  data_repairs: z.array(z.object({ modId: z.string() })),
});

type RepairState = {
  folder: string;
  packageExists: boolean;
  receiptExists: boolean;
  receiptRevision: number | null;
  historyDigest: string | null;
  resolutions: number;
  repairedMods: string[];
  mountedInGameinfo: boolean;
};

const citadelOf = async (world: string) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  return path.join(roots.game, "game", "citadel");
};

// Mirrors `localization_overlay_search_path`: the first 8 bytes of the folder
// name's SHA-256, or "default".
const overlayFolder = (profileFolder: string | null) =>
  profileFolder === null
    ? "dmm_localization_default"
    : `dmm_localization_${createHash("sha256")
        .update(profileFolder)
        .digest("hex")
        .slice(0, 16)}`;

/** What a game started from Steam would load for this profile. */
export const readRepairState = async (
  world: string,
  profileFolder: string | null,
): Promise<RepairState> => {
  const citadel = await citadelOf(world);
  const folder = overlayFolder(profileFolder);
  const exists = (file: string) =>
    readFile(path.join(citadel, folder, file)).then(
      () => true,
      () => false,
    );
  const raw = await readFile(
    path.join(citadel, folder, "compatibility.json"),
    "utf8",
  ).catch(() => null);
  const receipt = raw ? receiptSchema.parse(JSON.parse(raw)) : null;
  const gameinfo = await readFile(path.join(citadel, "gameinfo.gi"), "utf8");
  return {
    folder,
    packageExists: await exists("pak01_dir.vpk"),
    receiptExists: receipt !== null,
    receiptRevision: receipt?.revision ?? null,
    historyDigest: receipt?.key.history_digest ?? null,
    resolutions: receipt?.resolutions.length ?? 0,
    repairedMods: receipt
      ? [...new Set(receipt.data_repairs.map((repair) => repair.modId))].sort()
      : [],
    mountedInGameinfo: gameinfo
      .split("\n")
      .some(
        (line) =>
          line.trim().split(/\s+/).join(" ") === `Game citadel/${folder}`,
      ),
  };
};

const artifacts = () => {
  const directory = process.env.DMM_E2E_ARTIFACTS;
  if (!directory) throw new Error("DMM_E2E_ARTIFACTS is required");
  return directory;
};

type JsonValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Named values saved beside a case's other evidence. */
type CheckpointData = { [key: string]: JsonValue };

/** A JSON checkpoint, plus a matching screenshot while the window is open. */
export const checkpoint = async (
  name: string,
  data: CheckpointData,
  { screenshot = true } = {},
) => {
  const directory = artifacts();
  await writeFile(
    path.join(directory, `fixed-status-${name}.json`),
    JSON.stringify(data, null, 2),
  );
  if (screenshot)
    await browser.saveScreenshot(
      path.join(directory, `fixed-status-${name}.png`),
    );
};

const card = (modId: string) =>
  `//*[@title="${modId}"]/ancestor::*[.//button[@role="switch"]][1]`;

/** The library card's badge for a mod, as the player sees it. */
export const badgeStatus = async (modId: string) => {
  await navigate("my-mods");
  await findMod(modId);
  const badge = await $(`${card(modId)}//*[@data-testid="mod-health-badge"]`);
  return (await badge.isExisting())
    ? await badge.getAttribute("data-status")
    : null;
};

const row = (modId: string) =>
  `//*[@data-testid="mod-health-row"][.//button[@title="${modId}"]]`;

/** Opens the health dialog from the library banner. */
const openHealthDialog = async () => {
  await navigate("my-mods");
  const details = await $('[data-testid="mod-health-banner"]').$(
    "button=See details",
  );
  await details.waitForClickable({ timeout: 30_000 });
  await details.click();
  const dialog = await $('[role="dialog"]');
  await dialog.waitForDisplayed();
  return dialog;
};

const closeDialogs = async () => {
  for (let attempt = 0; attempt < 5; attempt++) {
    if ((await $$('[role="dialog"]').length) === 0) return;
    await browser.keys("Escape");
    await delay(300);
  }
};

/** Clicks the row's Fix in the health dialog, as the player would. */
const fixInDialog = async (modId: string) => {
  const dialog = await openHealthDialog();
  const fix = await dialog.$(row(modId)).$("button=Fix");
  await fix.waitForClickable();
  await fix.click();
};

export const waitForStatus = (
  folder: string | null,
  modId: string,
  status: string,
  timeoutMs = 60_000,
) =>
  observeUntil(
    `${modId} reads ${status}`,
    () => readHealth(folder),
    (health) => health[modId] === status,
    timeoutMs,
  );

/** Fixes `modId` from the health dialog and waits for its repair on disk. */
export const fixAndConfirm = async (
  world: string,
  folder: string | null,
  modId: string,
) => {
  await waitForStatus(folder, modId, "fixable");
  await fixInDialog(modId);
  await waitForStatus(folder, modId, "fixed");
  await closeDialogs();
  return observeUntil(
    `${modId} packaged`,
    () => readRepairState(world, folder),
    (state) => state.repairedMods.includes(modId) && state.packageExists,
  );
};
