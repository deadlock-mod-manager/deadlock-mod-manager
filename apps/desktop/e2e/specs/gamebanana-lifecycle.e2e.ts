import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  catalogRecipe,
  CATALOG_MOD_NAME,
} from "../support/gamebanana-fixtures";
import {
  assertCatalogDisk,
  readCatalogState,
} from "../support/gamebanana-oracle";
import { assertOwnedWorld, collectFileInventory } from "../support/world";
import { observeUntil } from "../support/observations";
import { navigate, reveal, installedFiles, activeFiles } from "../support/ui";
import {
  applyArchives,
  checkCatalog,
  chooseArchives,
  installCatalog,
  openCatalogOptions,
  reinstallCatalog,
  toggleCatalog,
  waitCatalogStatus,
} from "../support/catalog-actions";

describe("catalog installation lifecycle", () => {
  it("preserves the chosen variant through supported mod actions", async () => {
    const scenario = process.env.DMM_E2E_CASE_ID ?? "";
    const phase = process.env.DMM_E2E_PHASE;
    assert(phase === "catalog-change" || phase === "restart-changed");
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const checkpoint = path.join(world, "artifacts", "catalog-change.json");
    let files = scenario.startsWith("gamebanana-switch")
      ? ["common.vpk", "blue.vpk"]
      : ["gamebanana-combined", "gamebanana-force-update"].includes(scenario)
        ? ["base.vpk", "effects.vpk"]
        : ["common.vpk", "blue.vpk"];
    let downloads = catalogRecipe(scenario)
      .filter((archive) => archive.selected)
      .map((archive) => archive.name);
    let dormant: string[] = [];
    const disabled = scenario === "gamebanana-reinstall-disabled";
    await navigate("mods");
    await $(`[title="${CATALOG_MOD_NAME}"]`).click();

    if (phase === "catalog-change") {
      await installCatalog(world, scenario, files);
      await checkCatalog(world, scenario, "initial-install", files, downloads);
      if (scenario.startsWith("gamebanana-switch")) {
        let dialog = await openCatalogOptions();
        await expect(dialog.$("button=Apply")).toBeDisabled();
        await chooseArchives([]);
        await expect(dialog.$("button=Apply")).toBeDisabled();
        await chooseArchives(["common.zip", "red.zip"]);
        await dialog.$("button=Cancel").click();
        await checkCatalog(
          world,
          scenario,
          "cancel-preserves-selection",
          files,
          downloads,
        );
        if (scenario === "gamebanana-switch-failure") {
          dialog = await openCatalogOptions();
          await chooseArchives(["common.zip", "red.zip"]);
          await dialog.$("button=Apply").click();
          await expect(
            $(
              '//*[@data-sonner-toast and contains(., "Failed to update mod files")]',
            ),
          ).toBeDisplayed();
          await expect(dialog).toBeDisplayed();
          await dialog.$("button=Cancel").click();
          await checkCatalog(
            world,
            scenario,
            "failed-switch-preserves-install",
            files,
            downloads,
          );
        }
        await applyArchives(["common.zip", "red.zip"]);
        files = ["common.vpk", "red.vpk"];
        downloads.push("red.zip");
        dormant = ["blue.vpk"];
        await checkCatalog(
          world,
          scenario,
          "replaced-blue-with-red",
          files,
          downloads,
          dormant,
        );
        if (scenario === "gamebanana-switch") {
          await applyArchives(["common.zip", "red.zip", "extras.zip"]);
          files.push("extra.vpk", "spark.vpk");
          downloads.push("extras.zip");
          await checkCatalog(
            world,
            scenario,
            "added-multifile-archive",
            files,
            downloads,
            dormant,
          );
          await applyArchives(["common.zip", "blue.zip", "extras.zip"]);
          files = ["common.vpk", "blue.vpk", "extra.vpk", "spark.vpk"];
          dormant = ["red.vpk"];
          await checkCatalog(
            world,
            scenario,
            "returned-to-previous-archive",
            files,
            downloads,
            dormant,
          );
          await applyArchives(["common.zip", "blue.zip"]);
          files = ["common.vpk", "blue.vpk"];
          dormant = ["red.vpk", "extra.vpk", "spark.vpk"];
          await checkCatalog(
            world,
            scenario,
            "removed-extra-archive",
            files,
            downloads,
            dormant,
          );
        }
      } else if (scenario === "gamebanana-reselect") {
        // A single archive has no installed-file editor; delete and install
        // again is the current UI path for changing its VPK selection.
        await expect($("button=Manage files")).not.toBeDisplayed();
        const remove = await $("button=Delete Mod");
        await reveal(remove);
        await remove.click();
        await $('[role="alertdialog"]').$("button=Delete").click();
        await observeUntil(
          "Deleted catalog mod",
          () => readCatalogState(world),
          (state) => state.localMods.length === 0,
        );
        files = ["common.vpk", "red.vpk"];
        await installCatalog(world, scenario, files);
      } else if (scenario === "gamebanana-reinstall" || disabled) {
        if (disabled) await toggleCatalog(world, false);
        await reinstallCatalog(world, !disabled);
      } else if (scenario === "gamebanana-force-update") {
        const update = await $("button=Force Update");
        await reveal(update);
        await update.click();
        const dialog = await $('[role="dialog"]');
        for (const archive of catalogRecipe(scenario))
          await expect(
            dialog.$(`[id="download-${archive.name}"]`),
          ).toHaveAttribute("aria-checked", String(archive.selected));
        await dialog.$("button=Update Mod").click();
        await expect(dialog).not.toBeDisplayed();
        await waitCatalogStatus(world, "installed");
      }
      if (!disabled) {
        await checkCatalog(
          world,
          scenario,
          "changed-selection",
          files,
          downloads,
          dormant,
        );
        await toggleCatalog(world, false);
        await toggleCatalog(world, true);
        await checkCatalog(
          world,
          scenario,
          "reenabled-selection",
          files,
          downloads,
          dormant,
        );
      }
      await writeFile(
        checkpoint,
        JSON.stringify({
          processId: runtime.processId,
          files,
          downloads,
          dormant,
        }),
      );
    } else {
      const previous = z
        .object({
          processId: z.number(),
          files: z.array(z.string()),
          downloads: z.array(z.string()),
          dormant: z.array(z.string()),
        })
        .parse(JSON.parse(await readFile(checkpoint, "utf8")));
      assert.notEqual(runtime.processId, previous.processId);
      ({ files, downloads, dormant } = previous);
      if (!disabled)
        await checkCatalog(
          world,
          scenario,
          "restarted-selection",
          files,
          downloads,
          dormant,
        );
    }
    if (disabled) {
      await waitCatalogStatus(world, "downloaded");
      await expect($('[role="switch"]')).toHaveAttribute(
        "aria-checked",
        "false",
      );
      await expect(installedFiles()).not.toBeDisplayed();
      await expect(activeFiles()).not.toBeDisplayed();
      const {
        configuration: { roots },
      } = await assertOwnedWorld(world);
      const inventory = await collectFileInventory(
        path.join(roots.game, "game", "citadel", "addons"),
      );
      assert.deepEqual(
        Object.keys(inventory).filter((file) => file !== ".dmm.json"),
        [],
      );
    }
    await browser.saveScreenshot(path.join(world, "artifacts", `${phase}.png`));
    await writeFile(
      path.join(world, "artifacts", `${phase}.html`),
      await browser.getPageSource(),
    );
    await closeApplication(world, runtime.processId);
    if (!disabled)
      await assertCatalogDisk(world, scenario, `closed-${phase}`, {
        files,
        downloads,
        dormant,
      });
    else
      assert.equal(
        (await readCatalogState(world)).localMods[0].status,
        "downloaded",
      );
  });
});
