import { createHash } from "node:crypto";
import { appendFile, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { $, $$, browser } from "@wdio/globals";
import { z } from "zod";
import { fixtureGamePaths } from "./gameinfo-mounts";
import { observeUntil } from "./observations";
import { readLifecycleState } from "./lifecycle-oracle";
import { findMod, searchLibrary } from "./shard-actions";
import {
  dropFilePaths,
  navigate,
  openAddLocalMod,
  waitForClickable,
} from "./ui";
import { assertOwnedWorld } from "./world";

type HealthReport = {
  gameBuild: number | null;
  mods: { modId: string; status: string }[];
};

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

const overlayFolder = (profileFolder: string | null) =>
  profileFolder === null
    ? "dmm_localization_default"
    : `dmm_localization_${createHash("sha256")
        .update(profileFolder)
        .digest("hex")
        .slice(0, 16)}`;

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
    mountedInGameinfo: fixtureGamePaths(gameinfo).includes(`citadel/${folder}`),
  };
};

export const readReceiptModifiedMs = async (
  world: string,
  profileFolder: string | null,
): Promise<number | null> => {
  const citadel = await citadelOf(world);
  const receipt = path.join(
    citadel,
    overlayFolder(profileFolder),
    "compatibility.json",
  );
  return stat(receipt).then(
    (info) => info.mtimeMs,
    () => null,
  );
};

const readHistoryDigest = async (world: string): Promise<string | null> => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const citadel = path.join(roots.game, "game", "citadel");
  const installation = createHash("sha256").update(citadel).digest("hex");
  const file = path.join(
    roots.appCache,
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

export type CheckpointData = { [key: string]: JsonValue };

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

export const readCheckpoint = async <T>(name: string, schema: z.ZodType<T>) =>
  schema.parse(
    JSON.parse(
      await readFile(
        path.join(artifacts(), `fixed-status-${name}.json`),
        "utf8",
      ),
    ),
  );

type Sample = { atMs: number; status: string | undefined };

export const sampleStatus = async (
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

export const toggleMod = async (modId: string) => {
  await navigate("my-mods");
  await findMod(modId);
  const toggle = await $(`${card(modId)}//button[@role="switch"]`);
  await toggle.waitForClickable();
  await toggle.click();
};

export const closeOnceDisabled = (modId: string) =>
  browser.execute(
    async (xpath: string) => {
      const internals = window["__TAURI_INTERNALS__"];
      let changed = false;
      await internals.invoke("plugin:event|listen", {
        event: "mod-compatibility-changed",
        target: { kind: "Any" },
        handler: internals.transformCallback(() => {
          changed = true;
        }),
      });
      const poll = () => {
        const toggle = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        ).singleNodeValue;
        if (
          changed &&
          toggle instanceof Element &&
          toggle.getAttribute("aria-checked") === "false"
        ) {
          void internals.invoke("plugin:window|close", { label: "main" });
          return;
        }
        window.setTimeout(poll, 10);
      };
      poll();
    },
    `${card(modId)}//button[@role="switch"]`,
  );

type Badge = { status: string | null; text: string } | null;

const readBadge = async (modId: string): Promise<Badge> => {
  const badge = await $(`${card(modId)}//*[@data-testid="mod-health-badge"]`);
  if (!(await badge.isExisting())) return null;
  return {
    status: await badge.getAttribute("data-status"),
    text: await badge.getText(),
  };
};

export const badgeStatus = async (modId: string) => {
  await navigate("my-mods");
  await findMod(modId);
  return (await readBadge(modId))?.status ?? null;
};

export const row = (modId: string) =>
  `//*[@data-testid="mod-health-row"][.//button[@title="${modId}"]]`;

export const openHealthDialog = async () => {
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

export const fixAllInDialog = async () => {
  const dialog = await openHealthDialog();
  const fixAll = await dialog.$("button=Fix all");
  await fixAll.waitForClickable();
  await fixAll.click();
};

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

export const rewriteGameFiles = async (world: string, files: string[]) => {
  const citadel = await citadelOf(world);
  for (const file of files) {
    const target = path.join(citadel, file);
    const bytes = await readFile(target);
    await delay(1100);
    await writeFile(target, bytes);
  }
};

export const bumpGameBuild = async (world: string, build: number) => {
  const citadel = await citadelOf(world);
  await writeFile(
    path.join(citadel, "steam.inf"),
    `ClientVersion=${build}\nServerVersion=${build}\n`,
  );
};

const revisionSchema = z.looseObject({ revision: z.number() });
const healthCacheSchema = z.looseObject({
  profiles: z.record(
    z.string(),
    z.looseObject({
      mods: z.record(
        z.string(),
        z.looseObject({ key: z.looseObject({ revision: z.number() }) }),
      ),
    }),
  ),
});

export const ageRepairRevision = async (
  world: string,
  profileFolder: string | null,
) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const citadel = path.join(roots.game, "game", "citadel");
  const receiptPath = path.join(
    citadel,
    overlayFolder(profileFolder),
    "compatibility.json",
  );
  const receipt = revisionSchema.parse(
    JSON.parse(await readFile(receiptPath, "utf8")),
  );
  const revision = receipt.revision;
  await writeFile(
    receiptPath,
    JSON.stringify({ ...receipt, revision: revision - 1 }),
  );
  const cachePath = path.join(roots.appData, "mod-health.json");
  const cache = healthCacheSchema.parse(
    JSON.parse(await readFile(cachePath, "utf8")),
  );
  for (const profile of Object.values(cache.profiles))
    for (const entry of Object.values(profile.mods))
      if (entry.key.revision === revision) entry.key.revision = revision - 1;
  await writeFile(cachePath, JSON.stringify(cache));
  return { from: revision, to: revision - 1 };
};

export const importMod = async (
  world: string,
  file: string,
  enable: boolean,
) => {
  const before = (await readLifecycleState(world)).localMods.length;
  await openAddLocalMod();
  await dropFilePaths([path.join(world, "fixtures", file)]);
  const dialog = await $('[role="dialog"]');
  await dialog.waitForDisplayed();
  const add = await dialog.$("button=Add");
  await add.waitForClickable();
  await add.click();
  const state = await observeUntil(
    "new mod added to the library",
    () => readLifecycleState(world),
    (value) => value.localMods.length > before,
  );
  const added = state.localMods.at(-1);
  if (!added) throw new Error("Imported mod is missing from the library");
  if (!enable) return added;
  await navigate("my-mods");
  await searchLibrary(added.name);
  const toggle = `//*[@title="${added.name}"]/ancestor::*[.//button[@role="switch"]][1]//button[@role="switch"]`;
  await waitForClickable(toggle);
  await $(toggle).click();
  await observeUntil(
    "new mod enabled",
    () => readLifecycleState(world),
    (value) =>
      value.localMods.find((mod) => mod.remoteId === added.remoteId)?.status ===
      "installed",
  );
  return added;
};

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

const waitForFixedBadge = async (modId: string, timeoutMs: number) => {
  await navigate("my-mods");
  await findMod(modId);
  const started = Date.now();
  let badge = await readBadge(modId);
  while (badge?.status !== "fixed" && Date.now() - started < timeoutMs) {
    await delay(250);
    badge = await readBadge(modId);
  }
  return badge;
};

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
  const badge = await waitForFixedBadge(modId, 10_000);
  await checkpoint(name, {
    health: await readHealth(folder),
    repairs,
    samples,
    badge,
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
  if (badge?.status !== "fixed" || badge.text !== "Fixed for this patch")
    throw new Error(
      `${name}: ${modId}'s library card must read "Fixed for this patch", but shows ${JSON.stringify(badge)}`,
    );
  return { samples, repairs };
};

const manifestSchema = z.object({
  mods: z.record(
    z.string(),
    z.object({
      enabled: z.boolean(),
      compatibilityEnabled: z.boolean().optional(),
    }),
  ),
});

const readManifestEntry = async (
  world: string,
  profileFolder: string,
  modId: string,
) => {
  const citadel = await citadelOf(world);
  const raw = await readFile(
    path.join(citadel, "addons", profileFolder, ".dmm.json"),
    "utf8",
  );
  return manifestSchema.parse(JSON.parse(raw)).mods[modId];
};

export const readManifestEnabled = async (
  world: string,
  profileFolder: string,
  modId: string,
) => (await readManifestEntry(world, profileFolder, modId))?.enabled ?? null;

export const readFixChosen = async (
  world: string,
  profileFolder: string,
  modId: string,
) =>
  (await readManifestEntry(world, profileFolder, modId))
    ?.compatibilityEnabled ?? false;
