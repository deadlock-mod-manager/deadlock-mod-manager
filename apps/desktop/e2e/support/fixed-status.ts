import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
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

/** The install-wide observed-history file the receipt key digests. */
const readHistoryDigest = async (world: string): Promise<string | null> => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const citadel = path.join(roots.game, "game", "citadel");
  const installation = createHash("sha256").update(citadel).digest("hex");
  const file = path.join(
    roots.webviewData,
    "cache",
    "dev.stormix.deadlock-mod-manager",
    "compatibility",
    installation,
    "vdata-history.bin",
  );
  const bytes = await readFile(file).catch(() => null);
  return bytes ? createHash("sha256").update(bytes).digest("hex") : null;
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

type Sample = { atMs: number; status: string | undefined };

/**
 * Reads a mod's status every 250 ms for `durationMs` and records each change,
 * so a transient "Can be fixed" shows up in the evidence even if it heals.
 */
const sampleStatus = async (
  label: string,
  folder: string | null,
  modId: string,
  durationMs: number,
): Promise<Sample[]> => {
  const started = Date.now();
  const samples: Sample[] = [];
  while (Date.now() - started < durationMs) {
    const status = (await readHealth(folder))[modId];
    if (samples.at(-1)?.status !== status || samples.length === 0)
      samples.push({ atMs: Date.now() - started, status });
    await delay(250);
  }
  samples.push({
    atMs: Date.now() - started,
    status: (await readHealth(folder))[modId],
  });
  await appendFile(
    path.join(artifacts(), "fixed-status-samples.ndjson"),
    `${JSON.stringify({ label, modId, samples })}\n`,
  );
  return samples;
};

const card = (modId: string) =>
  `//*[@title="${modId}"]/ancestor::*[.//button[@role="switch"]][1]`;

/** Clicks a mod's enable switch in the library. */
export const toggleMod = async (modId: string) => {
  await navigate("my-mods");
  await findMod(modId);
  const toggle = await $(`${card(modId)}//button[@role="switch"]`);
  await toggle.waitForClickable();
  await toggle.click();
};

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

export const closeDialogs = async () => {
  for (let attempt = 0; attempt < 5; attempt++) {
    if ((await $$('[role="dialog"]').length) === 0) return;
    await browser.keys("Escape");
    await delay(300);
  }
};

/** Clicks Fix all in the health dialog. */
export const fixAllInDialog = async () => {
  const dialog = await openHealthDialog();
  const fixAll = await dialog.$("button=Fix all");
  await fixAll.waitForClickable();
  await fixAll.click();
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

/**
 * Samples `modId` for `durationMs`, saves a checkpoint, and asserts it ends
 * fixed with its repair packaged and mounted.
 */
export const expectStillFixed = async (
  world: string,
  folder: string | null,
  modId: string,
  name: string,
  durationMs: number,
  extra: () => Promise<CheckpointData> = async () => ({}),
) => {
  const samples = await sampleStatus(name, folder, modId, durationMs);
  const repairs = await readRepairState(world, folder);
  await checkpoint(name, {
    health: await readHealth(folder),
    repairs,
    samples,
    historyDigest: await readHistoryDigest(world),
    ...(await extra()),
  });
  if (samples.at(-1)?.status !== "fixed")
    throw new Error(
      `${name}: ${modId} must end fixed, but reads ${samples.at(-1)?.status} (samples ${JSON.stringify(samples)})`,
    );
  if (
    !repairs.repairedMods.includes(modId) ||
    !repairs.packageExists ||
    !repairs.mountedInGameinfo
  )
    throw new Error(
      `${name}: ${modId}'s repair must be packaged and mounted: ${JSON.stringify(repairs)}`,
    );
  return { samples, repairs };
};

const manifestSchema = z.object({
  mods: z.record(z.string(), z.object({ enabled: z.boolean() })),
});

/** The profile manifest's enabled flag, read straight from disk. */
export const readManifestEnabled = async (
  world: string,
  profileFolder: string,
  modId: string,
) => {
  const citadel = await citadelOf(world);
  const raw = await readFile(
    path.join(citadel, "addons", profileFolder, ".dmm.json"),
    "utf8",
  );
  return manifestSchema.parse(JSON.parse(raw)).mods[modId]?.enabled ?? null;
};
