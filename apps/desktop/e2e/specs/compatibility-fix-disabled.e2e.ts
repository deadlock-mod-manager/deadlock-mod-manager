import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  DISABLED_FIX_MOD,
  ENABLED_FIX_MOD,
  FIXES,
} from "../support/compatibility-fix-fixtures";
import { step } from "../support/evidence";
import { observeUntil } from "../support/observations";
import { findMod, setModEnabled } from "../support/shard-actions";
import { navigate } from "../support/ui";
import { assertOwnedWorld } from "../support/world";

type HealthReport = { mods: { modId: string; status: string }[] };

const readHealth = async (): Promise<Record<string, string>> => {
  const report = await browser.execute(
    (folder) =>
      // oxlint-disable-next-line no-underscore-dangle -- Tauri's injected IPC global.
      window.__TAURI_INTERNALS__.invoke<HealthReport>("get_mod_health", {
        profileFolder: folder,
      }),
    FIXES.folder,
  );
  return Object.fromEntries(
    report.mods.map((health) => [health.modId, health.status]),
  );
};

const manifestSchema = z.object({
  mods: z.record(
    z.string(),
    z.object({ compatibilityEnabled: z.boolean().optional() }),
  ),
});

const readFixChoices = async (world: string) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const manifest = manifestSchema.parse(
    JSON.parse(
      await readFile(
        path.join(
          roots.game,
          "game",
          "citadel",
          "addons",
          FIXES.folder,
          ".dmm.json",
        ),
        "utf8",
      ),
    ),
  );
  return Object.fromEntries(
    Object.entries(manifest.mods).map(([modId, entry]) => [
      modId,
      entry.compatibilityEnabled ?? false,
    ]),
  );
};

const receiptSchema = z.object({
  data_repairs: z.array(z.object({ modId: z.string() })),
});

// The mods whose repairs the package on disk holds, from its receipt.
const readRepairedMods = async (world: string): Promise<string[]> => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const citadel = path.join(roots.game, "game", "citadel");
  const folder = (await readdir(citadel)).find((name) =>
    name.startsWith("dmm_localization_"),
  );
  if (!folder) return [];
  const receipt = await readFile(
    path.join(citadel, folder, "compatibility.json"),
    "utf8",
  ).catch(() => null);
  if (!receipt) return [];
  return [
    ...new Set(
      receiptSchema
        .parse(JSON.parse(receipt))
        .data_repairs.map((repair) => repair.modId),
    ),
  ].sort();
};

const screenshot = (world: string, name: string) =>
  browser.saveScreenshot(path.join(world, "artifacts", `${name}.png`));

// Fixture mods are named after their IDs.
const row = (modId: string) =>
  `//*[@data-testid="mod-health-row"][.//button[@title="${modId}"]]`;

const openHealthDialog = async () => {
  const details = await $('[data-testid="mod-health-banner"]').$(
    "button=See details",
  );
  await details.waitForClickable();
  await details.click();
  const dialog = await $('[role="dialog"]');
  await dialog.waitForDisplayed();
  return dialog;
};

// Each fix toasts once; wait out the previous one so the next is unambiguous.
const nextSuccessToast = async (
  world: string,
  name: string,
  action: () => Promise<void>,
) => {
  await browser.waitUntil(
    async () => (await $$("[data-sonner-toast]")).length === 0,
    { timeoutMsg: "earlier toasts never closed" },
  );
  await action();
  const toast = await $("[data-sonner-toast][data-type='success']");
  await toast.waitForDisplayed();
  await screenshot(world, name);
  return toast.getText();
};

const SAVED_NOTE = "The fix applies when you enable this mod.";

describe("compatibility fix on a disabled mod", () => {
  it("saves the fix and applies it when the mod is enabled", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");

    await observeUntil("both mods checked as fixable", readHealth, (health) =>
      [ENABLED_FIX_MOD, DISABLED_FIX_MOD].every(
        (modId) => health[modId] === "fixable",
      ),
    );
    await setModEnabled(world, DISABLED_FIX_MOD, false);

    await step("Fix all saves the disabled mod's fix", async () => {
      const dialog = await openHealthDialog();
      const toast = await nextSuccessToast(world, "fix-all-toast", () =>
        dialog.$("button=Fix all").click(),
      );
      const health = await observeUntil(
        "enabled mod fixed",
        readHealth,
        (value) => value[ENABLED_FIX_MOD] === "fixed",
      );
      // The toast, the disabled mod's status and its saved choice must agree.
      assert.deepEqual(
        {
          toast: toast.trim(),
          disabledStatus: health[DISABLED_FIX_MOD],
          fixChoices: await readFixChoices(world),
        },
        {
          toast: "Fixed 2 mods",
          disabledStatus: "fixed",
          fixChoices: { [ENABLED_FIX_MOD]: true, [DISABLED_FIX_MOD]: true },
        },
      );
      // Only enabled mods are loaded, so only their repairs are packaged.
      assert.deepEqual(await readRepairedMods(world), [ENABLED_FIX_MOD]);
      await expect($(row(DISABLED_FIX_MOD))).toHaveText(
        expect.stringContaining(SAVED_NOTE),
      );
      await expect($(row(ENABLED_FIX_MOD))).not.toHaveText(
        expect.stringContaining(SAVED_NOTE),
      );
      await expect(dialog.$("button=Fix all")).not.toBeExisting();
      await screenshot(world, "fix-all");
    });

    await step("the disabled mod's page shows the saved fix", async () => {
      await $(row(DISABLED_FIX_MOD))
        .$(`button[title="${DISABLED_FIX_MOD}"]`)
        .click();
      const alert = await $('[data-testid="mod-health-alert"]');
      await alert.waitForDisplayed();
      await expect(alert).toHaveAttribute("data-status", "fixed");
      await expect(alert).toHaveText(expect.stringContaining(SAVED_NOTE));
      await expect(alert.$("button=Use original files")).toBeExisting();
      await screenshot(world, "disabled-mod-page");
    });

    await navigate("my-mods");
    await step("enabling the mod applies its saved fix", async () => {
      await setModEnabled(world, DISABLED_FIX_MOD, true);
      await observeUntil(
        "saved fix packaged",
        () => readRepairedMods(world),
        (mods) => mods.length === 2,
      );
      assert.deepEqual(
        await readRepairedMods(world),
        [DISABLED_FIX_MOD, ENABLED_FIX_MOD].sort(),
      );
      await observeUntil(
        "both mods fixed",
        readHealth,
        (health) =>
          health[ENABLED_FIX_MOD] === "fixed" &&
          health[DISABLED_FIX_MOD] === "fixed",
      );
    });

    await step("disabling keeps the fix, and it can be undone", async () => {
      await setModEnabled(world, DISABLED_FIX_MOD, false);
      assert.equal((await readHealth())[DISABLED_FIX_MOD], "fixed");
      await findMod(DISABLED_FIX_MOD);
      await $(`//*[@title="${DISABLED_FIX_MOD}"]`).click();
      const alert = await $('[data-testid="mod-health-alert"]');
      await alert.waitForDisplayed();
      await expect(alert).toHaveText(expect.stringContaining(SAVED_NOTE));
      const restore = await alert.$("button=Use original files");
      await restore.waitForClickable();
      const toast = await nextSuccessToast(world, "original-files-toast", () =>
        restore.click(),
      );
      assert.equal(
        toast.trim(),
        `${DISABLED_FIX_MOD} now uses its original files`,
      );
      await observeUntil(
        "disabled mod uses its original files",
        readHealth,
        (health) => health[DISABLED_FIX_MOD] === "originalFiles",
      );
      await navigate("my-mods");
      await setModEnabled(world, DISABLED_FIX_MOD, true);
      // Enabling changes the package's inputs, so the enabled mod reads as
      // fixed again only once the package is rebuilt.
      await observeUntil(
        "package rebuilt without the opted-out mod",
        readHealth,
        (health) =>
          health[ENABLED_FIX_MOD] === "fixed" &&
          health[DISABLED_FIX_MOD] === "originalFiles",
      );
      assert.deepEqual(await readRepairedMods(world), [ENABLED_FIX_MOD]);
      assert.equal((await readFixChoices(world))[DISABLED_FIX_MOD], false);
    });

    await closeApplication(world, runtime.processId);
  });
});
