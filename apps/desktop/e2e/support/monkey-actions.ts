import assert from "node:assert/strict";
import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { $, $$, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { chooseInstallFiles } from "./catalog-actions";
import { readBrokenLaunches } from "./broken-state-oracle";
import { MULTIPAK_MODS } from "./multipak-update-fixtures";
import {
  monkeyPaths,
  readMonkeyManifest,
  readMonkeyStore,
  assertMonkeyInvariants,
  type MonkeyModel,
} from "./monkey-oracle";
import { observeUntil } from "./observations";
import { ALPHA, BETA } from "./profile-fixtures";
import { openSettings } from "./settings-actions";
import { activateProfile, navigate, reveal } from "./ui";
import { writeSyntheticVpk } from "./vpk";
import { holdVpkLock } from "./windows-lock";
import { reorder } from "./mod-ordering";

export const openMonkeyMod = async (name: string) => {
  await navigate("mods");
  await $(`[title="${name}"]`).click();
};
export const waitMonkeyStatus = (world: string, id: string, status: string) =>
  observeUntil(
    `${id}: ${status}`,
    () => readMonkeyStore(world),
    (state) => {
      const active = state.profiles[state.activeProfileId];
      const local = state.localMods.find((mod) => mod.remoteId === id);
      const profile = active.mods.find((mod) => mod.remoteId === id);
      return (
        local?.status === status &&
        profile?.status === status &&
        // The enabled flag is written just after the status.
        (active.enabledMods[id]?.enabled ?? false) ===
          (status === "installed") &&
        (status !== "downloaded" ||
          ((local.installedVpks?.length ?? 0) === 0 &&
            (profile.installedVpks?.length ?? 0) === 0))
      );
    },
  );

export const installMonkeyMod = async (world: string, id: string) => {
  const fixture = MULTIPAK_MODS.find((mod) => mod.id === id);
  assert(fixture);
  await openMonkeyMod(fixture.name);
  await $('button[aria-label="Download Mod"]').click();
  await waitMonkeyStatus(world, id, "downloaded");
  await $('[role="switch"]').waitForClickable();
  await $('[role="switch"]').click();
  const mod = (await readMonkeyStore(world)).localMods.find(
    (item) => item.remoteId === id,
  );
  assert(mod?.installedFileTree);
  await chooseInstallFiles(mod.installedFileTree.files);
  await waitMonkeyStatus(world, id, "installed");
  await expect($('[role="switch"]')).toHaveAttribute("aria-checked", "true");
};

export const switchMonkeyProfile = async (world: string) => {
  const state = await readMonkeyStore(world);
  const profile = state.activeProfileId === ALPHA.id ? BETA : ALPHA;
  await navigate("my-mods");
  await activateProfile(profile.name);
  await observeUntil(
    "Active profile and its library persisted",
    () => readMonkeyStore(world),
    (current) =>
      current.activeProfileId === profile.id &&
      isDeepStrictEqual(current.localMods, current.profiles[profile.id].mods),
  );
  return profile.id;
};

export const reorderMonkey = async (world: string, order: string[]) => {
  const { folder } = await monkeyPaths(world);
  return reorder(world, order, false, folder);
};

export const launchMonkey = async (
  world: string,
  vanilla: boolean,
  blocked = false,
) => {
  await navigate("my-mods");
  const count = (await readBrokenLaunches(world)).length;
  const button = await $(
    vanilla ? "button=Launch without mods" : "button*=Launch modded",
  );
  await button.waitForClickable();
  await button.click();
  if (blocked) {
    const dialog = await $('[data-testid="launch-repair-dialog"]');
    await dialog.waitForDisplayed();
    assert.equal(
      (await readBrokenLaunches(world)).length,
      count,
      "Missing files must block launch recording",
    );
    await $('[data-testid="launch-repair-cancel"]').click();
    await dialog.waitForDisplayed({ reverse: true });
    return;
  }
  await observeUntil(
    "Recorded launch",
    () => readBrokenLaunches(world),
    (launches) => launches.length === count + 1,
  );
};

export const repairMonkey = async (world: string, external: Set<string>) => {
  const { folder } = await monkeyPaths(world);
  await openSettings("tools");
  const button = await $("button=Repair mod folder");
  await reveal(button);
  await button.click();
  const dialog = await $('[role="dialog"]');
  await dialog.waitForDisplayed();
  await dialog.$("button=Repair").click();
  await expect(dialog).toHaveText(
    expect.stringContaining("Mod folder repaired"),
  );
  await dialog.$("button=Close").click();
  for (const file of external)
    if (file.split("/")[1] === folder) external.delete(file);
};

const attemptMonkeyUpdate = async () => {
  const update = await $(
    '//button[normalize-space()="Force Update" or normalize-space()="Update Mod"]',
  );
  await reveal(update);
  await update.waitForClickable();
  await update.click();
  const dialog = await $('[role="dialog"]');
  await dialog.waitForDisplayed();
  await dialog.$("button=Update Mod").click();
  await expect(dialog).not.toBeDisplayed({ wait: 30_000 });
};

export const updateMonkeyMod = async (
  world: string,
  id: string,
  failure: boolean,
  verifyFailure: () => Promise<void>,
) => {
  const mod = MULTIPAK_MODS.find((item) => item.id === id);
  assert(mod);
  await navigate("my-mods");
  const check = await $("button=Check for updates");
  await check.waitForEnabled({ timeout: 30_000 });
  await check.click();
  await check.waitForEnabled({ timeout: 30_000 });
  await openMonkeyMod(mod.name);

  const failureToasts =
    '[data-sonner-toast][data-type="warning"], [data-sonner-toast][data-type="error"]';
  // An earlier step's failure toast may still be visible.
  const shown = new Set(
    await $$(failureToasts).map((toast) => toast.elementId),
  );
  await attemptMonkeyUpdate();
  if (failure) {
    await browser.waitUntil(
      async () => {
        for (const toast of await $$(failureToasts)) {
          if (shown.has(toast.elementId)) continue;
          const text = await toast.getText().catch(() => "");
          if (text.includes("failed")) return true;
        }
        return false;
      },
      { timeout: 30_000, timeoutMsg: "No new update failure toast appeared" },
    );
    await verifyFailure();
    await attemptMonkeyUpdate();
  }
  await waitMonkeyStatus(world, id, "installed");
};

export const addMonkeyExternal = async (
  world: string,
  index: number,
  external: Set<string>,
) => {
  const { base, folder } = await monkeyPaths(world);
  const filename = `monkey-external-${index}.vpk`;
  await writeSyntheticVpk(path.join(base, filename), [
    { path: "scripts/monkey-external.txt", contents: `External ${index}\n` },
  ]);
  external.add(`addons/${folder}/${filename}`);
  return filename;
};

export const deleteMonkeyFile = async (
  world: string,
  id: string,
  model: MonkeyModel,
  external: Set<string>,
  label: string,
) => {
  const { base, folder } = await monkeyPaths(world);
  const manifest = await readMonkeyManifest(base);
  const filename = manifest.mods[id].currentVpks[0];
  await unlink(path.join(base, filename));
  const missing = new Set([`addons/${folder}/${filename}`]);
  await assertMonkeyInvariants(
    world,
    `${label}-deleted`,
    model,
    external,
    missing,
  );
  await launchMonkey(world, false, true);
  const mod = (await readMonkeyStore(world)).localMods.find(
    (item) => item.remoteId === id,
  );
  assert(mod);
  await openMonkeyMod(mod.name);
  const reinstall = await $('button[aria-label="Reinstall"]');
  await reveal(reinstall);
  await reinstall.click();
  await $('[role="alertdialog"]').$("button=Reinstall").click();
  // Earlier steps' success toasts can still be on screen.
  await browser.waitUntil(
    async () => {
      for (const toast of await $$('[data-sonner-toast][data-type="success"]'))
        if ((await toast.getText()).includes("reinstalled")) return true;
      return false;
    },
    { timeoutMsg: "No reinstalled success toast" },
  );
  await waitMonkeyStatus(world, id, "installed");
  await observeUntil(
    `${id}: no missing files`,
    () => readMonkeyStore(world),
    (state) =>
      [state.localMods, state.profiles[state.activeProfileId].mods].every(
        (mods) =>
          mods.find((item) => item.remoteId === id)?.missingVpks.length === 0,
      ),
  );
  return filename;
};

export const lockMonkeyReorder = async (world: string, order: string[]) => {
  const { base } = await monkeyPaths(world);
  const manifest = await readMonkeyManifest(base);
  const filename = manifest.mods[order[order.length - 1]].currentVpks[0];
  const release = await holdVpkLock(world, path.join(base, filename));
  try {
    const error = await reorderMonkey(world, order);
    assert(error, "Locked reorder must return a clear command error");
    return error;
  } finally {
    await release();
  }
};

export const monkeyCheckpointSchema = z.object({
  processId: z.number(),
  activeProfileId: z.string(),
  model: z.record(
    z.string(),
    z.record(
      z.string(),
      z.object({ enabled: z.boolean(), version: z.enum(["v1", "v2"]) }),
    ),
  ),
  external: z.array(z.string()),
});
export const writeMonkeyCheckpoint = async (
  world: string,
  processId: number,
  model: MonkeyModel,
  external: Set<string>,
) => {
  await writeFile(
    path.join(world, "artifacts", "monkey-checkpoint.json"),
    JSON.stringify(
      {
        processId,
        activeProfileId: (await readMonkeyStore(world)).activeProfileId,
        model,
        external: [...external],
      },
      null,
      2,
    ),
  );
};
