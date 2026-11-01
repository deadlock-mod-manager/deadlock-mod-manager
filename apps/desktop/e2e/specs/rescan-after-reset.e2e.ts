import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import {
  CATALOG_MOD_ID,
  CATALOG_MOD_NAME,
} from "../support/gamebanana-fixtures";
import { observeUntil, readPersistedDocument } from "../support/observations";
import { ALPHA } from "../support/profile-fixtures";
import {
  RESET_DISABLED_MOD,
  RESET_LOCAL_MOD,
  RESET_LOCAL_NAME,
  resetProfileDirectory,
} from "../support/rescan-after-reset-fixtures";
import { openSettings } from "../support/settings-actions";
import { navigate, reveal, waitForOverlaysClosed } from "../support/ui";
import { collectFileInventory } from "../support/world";

const modSchema = z.looseObject({
  remoteId: z.string(),
  name: z.string(),
  status: z.string(),
  installedVpks: z.array(z.string()).nullish(),
  installOrder: z.number().nullish(),
});
const readLibrary = async (world: string) => {
  const { state } = z
    .object({
      state: z.looseObject({
        localMods: z.array(modSchema),
        profiles: z.record(
          z.string(),
          z.looseObject({
            mods: z.array(modSchema),
            enabledMods: z.record(
              z.string(),
              z.looseObject({ enabled: z.boolean() }),
            ),
          }),
        ),
      }),
    })
    .parse(await readPersistedDocument(world));
  return { localMods: state.localMods, alpha: state.profiles[ALPHA.id] };
};
type Library = Awaited<ReturnType<typeof readLibrary>>;

const RESTORED = [CATALOG_MOD_ID, RESET_LOCAL_MOD, RESET_DISABLED_MOD];
const isRestored = ({ localMods, alpha }: Library) =>
  RESTORED.every((id) => localMods.some((mod) => mod.remoteId === id)) &&
  RESTORED.every((id) => alpha.mods.some((mod) => mod.remoteId === id));

const assertRestored = ({ localMods, alpha }: Library) => {
  assert.deepEqual(
    localMods.map((mod) => mod.remoteId).sort(),
    [...RESTORED].sort(),
  );
  const byId = new Map(localMods.map((mod) => [mod.remoteId, mod]));
  const catalog = byId.get(CATALOG_MOD_ID);
  assert.equal(catalog?.name, CATALOG_MOD_NAME);
  assert.equal(catalog?.status, "installed");
  assert.deepEqual(catalog?.installedVpks, ["pak01_dir.vpk", "pak02_dir.vpk"]);
  assert.equal(catalog?.installOrder, 0);
  const local = byId.get(RESET_LOCAL_MOD);
  assert.equal(local?.name, RESET_LOCAL_NAME);
  assert.equal(local?.status, "installed");
  assert.deepEqual(local?.installedVpks, ["pak03_dir.vpk"]);
  assert.equal(local?.installOrder, 1);
  const disabled = byId.get(RESET_DISABLED_MOD);
  assert.equal(disabled?.status, "downloaded");
  assert.deepEqual(disabled?.installedVpks ?? [], []);
  assert.equal(alpha.enabledMods[CATALOG_MOD_ID]?.enabled, true);
  assert.equal(alpha.enabledMods[RESET_LOCAL_MOD]?.enabled, true);
  assert.notEqual(alpha.enabledMods[RESET_DISABLED_MOD]?.enabled, true);
};

const checkpointPath = (world: string) =>
  path.join(world, "artifacts", "rescan-after-reset-inventory.json");

describe("re-scanning after Clear Mods State", () => {
  it("restores the mods DMM installed without asking about their files", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const phase = process.env.DMM_E2E_PHASE;
    assert(phase === "reset-rescan" || phase === "restart-rescan");
    await navigate("my-mods");
    const directory = resetProfileDirectory(world);
    if (phase === "reset-rescan") {
      const before = await collectFileInventory(directory);
      await mkdir(path.dirname(checkpointPath(world)), { recursive: true });
      await writeFile(checkpointPath(world), JSON.stringify(before));

      await step("reset mods state from settings", async () => {
        await openSettings("tools");
        const reset = await $("button=Clear Mods State");
        await reveal(reset);
        await reset.waitForClickable();
        await reset.click();
        const confirm = await $('[role="alertdialog"]').$(
          "button=Clear Mods State",
        );
        await confirm.waitForClickable();
        await confirm.click();
        await observeUntil(
          "library emptied by reset",
          () => readLibrary(world),
          ({ localMods, alpha }) =>
            localMods.length === 0 && alpha.mods.length === 0,
        );
        await waitForOverlaysClosed();
      });
      assert.deepEqual(await collectFileInventory(directory), before);

      await step("analyze local addons without restarting", async () => {
        await navigate("my-mods");
        await $('button[aria-label="More actions"]').click();
        await browser.keys("ArrowDown");
        await $('[role="menuitem"]=Analyze Local Addons').click();
        await $('[role="tab"]*=Unknown (').waitForDisplayed({
          timeout: 60_000,
        });
      });

      await step("only the hand-placed file needs identifying", async () => {
        await expect($('[role="tab"]*=Unknown (')).toHaveText("Unknown (1)");
        await browser.saveScreenshot(
          path.join(world, "artifacts", "rescan-results.png"),
        );
      });

      const restored = await observeUntil(
        "library restored from the profile's records",
        () => readLibrary(world),
        isRestored,
      );
      assertRestored(restored);
      assert.deepEqual(await collectFileInventory(directory), before);
    } else {
      assertRestored(await readLibrary(world));
      const before = z
        .record(z.string(), z.string())
        .parse(JSON.parse(await readFile(checkpointPath(world), "utf8")));
      assert.deepEqual(await collectFileInventory(directory), before);
      await expect(
        $(`//main//*[normalize-space()="${RESET_LOCAL_NAME}"]`),
      ).toBeDisplayed();
    }
    await closeApplication(world, runtime.processId);
  });
});
