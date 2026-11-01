import assert from "node:assert/strict";
import { chmod, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { installCatalog, waitCatalogStatus } from "../support/catalog-actions";
import { step } from "../support/evidence";
import {
  CATALOG_MOD_ID,
  CATALOG_MOD_NAME,
} from "../support/gamebanana-fixtures";
import {
  assertCatalogDisk,
  readCatalogState,
} from "../support/gamebanana-oracle";
import { observeUntil } from "../support/observations";
import { navigate, reveal } from "../support/ui";
import { assertOwnedWorld, collectFileInventory } from "../support/world";

const FAILED_TOAST = `//*[@data-sonner-toast and contains(., "Failed to reinstall ${CATALOG_MOD_NAME}")]`;
const SUCCESS_TOAST = '//*[@data-sonner-toast and contains(., "reinstalled")]';
const PROMPT = '[data-testid="readonly-file-dialog"]';

const modRecord = async (world: string) => {
  const state = await readCatalogState(world);
  const mod = state.localMods.find(
    (entry) => entry.remoteId === CATALOG_MOD_ID,
  );
  return {
    status: mod?.status,
    installedVpks: mod?.installedVpks,
    enabled:
      state.profiles[state.activeProfileId].enabledMods[CATALOG_MOD_ID]
        ?.enabled ?? false,
  };
};

describe("reinstall with a file that stays read-only", () => {
  it("stops without touching the mod when the user keeps the file read-only", async () => {
    const scenario = process.env.DMM_E2E_CASE_ID ?? "";
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const {
      configuration: { roots },
    } = await assertOwnedWorld(world);
    const addons = path.join(roots.game, "game", "citadel", "addons");
    const cache = path.join(roots.appData, "mods");

    await navigate("mods");
    await $(`[title="${CATALOG_MOD_NAME}"]`).click();
    await installCatalog(world, scenario, ["base.vpk"]);

    const vpks = Object.keys(await collectFileInventory(addons)).filter(
      (file) => file.endsWith(".vpk"),
    );
    assert.equal(vpks.length, 1, `Expected one installed VPK: ${vpks}`);
    const vpk = path.join(addons, vpks[0]);
    const before = {
      mod: await modRecord(world),
      addons: await collectFileInventory(addons),
      cache: await collectFileInventory(cache),
    };
    assert.equal(before.mod.status, "installed");
    assert.equal(before.mod.enabled, true);

    const { mode } = await stat(vpk);
    await chmod(vpk, 0o444);
    try {
      await step("decline making the installed VPK writable", async () => {
        const button = await $('button[aria-label="Reinstall"]');
        await reveal(button);
        await button.click();
        const confirm = await $('[role="alertdialog"]');
        await expect(confirm).toHaveText(
          expect.stringContaining(`Reinstall ${CATALOG_MOD_NAME}?`),
        );
        await confirm.$("button=Reinstall").click();

        const prompt = await $(PROMPT);
        await prompt.waitForDisplayed();
        assert.equal(
          path.normalize(
            await $('[data-testid="readonly-file-path"]').getText(),
          ),
          vpk,
        );
        await browser.saveScreenshot(
          path.join(world, "artifacts", "readonly-prompt.png"),
        );
        await prompt.$("button=Cancel").click();
        await prompt.waitForDisplayed({ reverse: true });
      });

      // Either the reinstall reports the failure, or it carried on and the
      // install step hit the same read-only file and asked again.
      const settled = await observeUntil(
        "Reinstall settled after the declined prompt",
        async () => ({
          failed: await $(FAILED_TOAST).isDisplayed(),
          askedAgain: await $(PROMPT).isDisplayed(),
        }),
        (seen) => seen.failed || seen.askedAgain,
        60_000,
      );
      const after = {
        settled,
        mod: await modRecord(world),
        addons: await collectFileInventory(addons),
        cache: await collectFileInventory(cache),
        mode: (await stat(vpk)).mode & 0o777,
      };
      await writeFile(
        path.join(world, "artifacts", "after-decline.json"),
        JSON.stringify({ before, after }, null, 2),
      );
      await browser.saveScreenshot(
        path.join(world, "artifacts", "after-decline.png"),
      );

      assert.equal(
        settled.askedAgain,
        false,
        "Reinstall went on after the declined prompt and asked again while installing",
      );
      await expect($(FAILED_TOAST)).toHaveText(expect.stringContaining(vpk));
      await expect($(SUCCESS_TOAST)).not.toBeDisplayed();
      assert.deepEqual(after.mod, before.mod);
      assert.deepEqual(after.addons, before.addons);
      assert.deepEqual(after.cache, before.cache);
      assert.equal(after.mode, 0o444);
      await expect($('button[aria-label="Reinstall"]')).toBeEnabled();
      await waitCatalogStatus(world, "installed");
    } finally {
      await chmod(vpk, mode);
    }

    await writeFile(
      path.join(world, "artifacts", "reinstall-readonly.html"),
      await browser.getPageSource(),
    );
    await closeApplication(world, runtime.processId);
    await assertCatalogDisk(world, scenario, "closed-reinstall-readonly");
    assert.deepEqual(await collectFileInventory(addons), before.addons);
  });
});
