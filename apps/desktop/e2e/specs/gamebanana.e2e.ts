import { $, browser, expect } from "@wdio/globals";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { retireClosedApplication } from "../support/application-exit";
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
    const runtime = await browser.execute(() =>
      window.__TAURI_INTERNALS__.invoke<{
        processId: number;
        roots: { world: string };
      }>("e2e_status"),
    );
    const world = runtime.roots.world;
    const checkpoint = path.join(world, "artifacts", "catalog-process.json");
    const unseenVersion = await browser.execute(
      async () =>
        localStorage.getItem("lastSeenVersion") !==
        (await window.__TAURI_INTERNALS__.invoke<string>("plugin:app|version")),
    );
    if (unseenVersion) {
      const dismiss = await $("button=Got it!");
      await dismiss.waitForDisplayed();
      await dismiss.click();
      await expect(dismiss).not.toBeDisplayed();
    }
    await $('a[href="/mods"]').click();
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
        const dialog = await $('[role="dialog"]');
        await dialog.waitForDisplayed();
        await expect(dialog.$("button=Download Selected")).toBeDisabled();
        for (const archive of recipe) {
          const checkbox = await dialog.$(`[id="file-${archive.name}"]`);
          await expect(checkbox).toHaveAttribute("aria-checked", "false");
          if (archive.selected) await checkbox.click();
        }
        await dialog.$("button=Download Selected").click();
        await expect(dialog).not.toBeDisplayed();
      }
      const toggle = await $('[role="switch"]');
      await toggle.waitForClickable();
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await toggle.click();
      if (scenario === "gamebanana-variants") {
        const dialog = await $('[role="dialog"]');
        await dialog.waitForDisplayed();
        const red = await dialog.$(
          './/button[.//div[normalize-space()="red.vpk"]]',
        );
        await red.click();
        await expect(red.$('[role="checkbox"]')).toHaveAttribute(
          "aria-checked",
          "false",
        );
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
    const installed = await $(
      '//*[normalize-space()="Installed Files"]/parent::div/parent::div',
    );
    await browser.execute(
      (element: HTMLElement) =>
        element.scrollIntoView({ block: "center", behavior: "instant" }),
      installed,
    );
    await expect(installed).toBeDisplayed();
    const names = await installed
      .$$(".font-mono")
      .map((element) => element.getText());
    assert.deepEqual(names.sort(), installedCatalogFiles(scenario));
    for (const archive of catalogRecipe(scenario).filter(
      (item) => item.selected,
    )) {
      const group = await installed.$(
        `.//span[normalize-space()="${archive.name}"]/parent::div/parent::div`,
      );
      const expectedFiles = archive.files.filter((name) =>
        installedCatalogFiles(scenario).includes(name),
      );
      assert.deepEqual(
        (
          await group.$$(".font-mono").map((element) => element.getText())
        ).sort(),
        expectedFiles.sort(),
      );
      await expect(group).toHaveText(
        expect.stringContaining(
          `${expectedFiles.length} file${expectedFiles.length === 1 ? "" : "s"}`,
        ),
      );
    }
    const active = await $(
      '//*[normalize-space()="Active Mod files"]/parent::div/parent::div',
    );
    await browser.execute(
      (element: HTMLElement) =>
        element.scrollIntoView({ block: "center", behavior: "instant" }),
      active,
    );
    await expect(active).toBeDisplayed();
    const activeNames = await active
      .$$(".font-mono")
      .map((element) => element.getText());
    assert.equal(activeNames.length, installedCatalogFiles(scenario).length);
    await browser.execute(
      (element: HTMLElement) =>
        element.scrollIntoView({ block: "center", behavior: "instant" }),
      installed,
    );
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
    await browser.execute(() => {
      window.setTimeout(() => {
        void window.__TAURI_INTERNALS__.invoke("plugin:window|close", {
          label: "main",
        });
      }, 100);
    });
    await retireClosedApplication(runtime.processId);
    await assertCatalogDisk(world, scenario, phase);
    assert.deepEqual(
      activeNames.sort(),
      (await readCatalogState(world)).localMods[0].installedVpks?.toSorted(),
    );
  });
});
