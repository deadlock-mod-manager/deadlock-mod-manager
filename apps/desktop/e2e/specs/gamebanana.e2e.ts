import {
  navigate,
  reveal,
  selectDownloads,
  deselectInstallFile,
  installedFiles,
  activeFiles,
} from "../support/ui";
import { startApplication } from "../support/application";
import { $, browser, expect } from "@wdio/globals";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { closeApplication } from "../support/application-exit";
import {
  catalogRecipe,
  CATALOG_MOD_NAME,
  installedCatalogFiles,
} from "../support/gamebanana-fixtures";
import {
  assertCatalogDisk,
  readCatalogState,
} from "../support/gamebanana-oracle";

describe("GameBanana catalog installation", () => {
  it("renders exactly the installed files and preserves them in a new process", async () => {
    const scenario = process.env.DMM_E2E_CASE_ID ?? "";
    const phase = process.env.DMM_E2E_PHASE;
    assert(phase === "catalog-install" || phase === "restart-catalog");
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const checkpoint = path.join(world, "artifacts", "catalog-process.json");
    await navigate("mods");
    const card = await $(`[title="${CATALOG_MOD_NAME}"]`);
    await card.waitForDisplayed();
    await card.click();
    await expect(
      $(`//div[normalize-space()="${CATALOG_MOD_NAME}"]`),
    ).toBeDisplayed();
    if (phase === "catalog-install") {
      assert.deepEqual((await readCatalogState(world)).localMods, []);
      await $('button[aria-label="Download Mod"]').click();
      const recipe = catalogRecipe(scenario);
      if (recipe.length > 1) {
        await selectDownloads(
          recipe
            .filter((archive) => archive.selected)
            .map((archive) => archive.name),
        );
      }
      const toggle = await $('[role="switch"]');
      await toggle.waitForClickable();
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await toggle.click();
      if (scenario === "gamebanana-variants") {
        const dialog = await $('[role="dialog"]');
        await dialog.waitForDisplayed();
        await deselectInstallFile("red.vpk");
        await dialog.$("button=Install Selected").click();
        await expect(dialog).not.toBeDisplayed();
      }
      await writeFile(
        checkpoint,
        JSON.stringify({ processId: runtime.processId }),
      );
    } else {
      const previous = z
        .object({ processId: z.number() })
        .parse(JSON.parse(await readFile(checkpoint, "utf8")));
      assert.notEqual(runtime.processId, previous.processId);
    }
    await expect($('[role="switch"]')).toHaveAttribute("aria-checked", "true");
    const installed = await installedFiles();
    await reveal(installed);
    await expect(installed).toBeDisplayed();
    const names = await installed
      .$$("[data-file-name]")
      .map((element) => element.getText());
    assert.deepEqual(names.sort(), installedCatalogFiles(scenario));
    for (const archive of catalogRecipe(scenario).filter(
      (item) => item.selected,
    )) {
      const group = await installed.$(`[data-archive="${archive.name}"]`);
      const expectedFiles = archive.files.filter((name) =>
        installedCatalogFiles(scenario).includes(name),
      );
      assert.deepEqual(
        (
          await group.$$("[data-file-name]").map((element) => element.getText())
        ).sort(),
        expectedFiles.sort(),
      );
      await expect(group).toHaveText(
        expect.stringContaining(
          `${expectedFiles.length} file${expectedFiles.length === 1 ? "" : "s"}`,
        ),
      );
    }
    const active = await activeFiles();
    await reveal(active);
    await expect(active).toBeDisplayed();
    const activeNames = await active
      .$$("[data-file-name]")
      .map((element) => element.getText());
    assert.equal(activeNames.length, installedCatalogFiles(scenario).length);
    await reveal(installed);
    await browser.waitUntil(() =>
      installed.isDisplayed({ withinViewport: true }),
    );
    await browser.saveScreenshot(
      path.join(world, "artifacts", `catalog-${phase}.png`),
    );
    await writeFile(
      path.join(world, "artifacts", `catalog-${phase}.html`),
      await browser.getPageSource(),
    );
    await closeApplication(world, runtime.processId);
    await assertCatalogDisk(world, scenario, phase);
    assert.deepEqual(
      activeNames.sort(),
      (await readCatalogState(world)).localMods[0].installedVpks?.toSorted(),
    );
  });
});
