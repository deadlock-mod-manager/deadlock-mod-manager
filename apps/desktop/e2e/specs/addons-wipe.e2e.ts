import assert from "node:assert/strict";
import path from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { damageClosedWorld } from "../support/broken-state-fixtures";
import {
  assertReinstalledBrokenState,
  assertRemovedBrokenState,
  assertUntouchedBrokenNeighbours,
  captureBrokenState,
  readBrokenState,
} from "../support/broken-state-oracle";
import { installCatalog, reinstallCatalog } from "../support/catalog-actions";
import { step } from "../support/evidence";
import { CATALOG_MOD_NAME } from "../support/gamebanana-fixtures";
import { observeUntil } from "../support/observations";
import { ALPHA, ALPHA_MODS } from "../support/profile-fixtures";
import { openSettings } from "../support/settings-actions";
import { navigate, reveal, waitForDisplayed } from "../support/ui";

describe("a profile addons folder wiped outside DMM", () => {
  it("clears missing installs and can reinstall without a stalled transfer", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const phase = process.env.DMM_E2E_PHASE;
    assert(
      phase === "seed-wipe" ||
        phase === "recover-wipe" ||
        phase === "restart-wipe",
    );
    await navigate("my-mods");
    if (phase === "seed-wipe") {
      const seeded = await captureBrokenState(world, phase);
      assert.deepEqual(
        seeded.state.localMods.map((mod) => mod.remoteId),
        ALPHA_MODS,
      );
      for (const modId of ALPHA_MODS) {
        assert.equal(
          seeded.state.profiles[ALPHA.id].enabledMods[modId]?.enabled,
          true,
        );
        await expect(
          $(`//main//*[normalize-space()="${modId}"]`),
        ).toBeDisplayed();
      }
      assert.equal(
        Object.keys(seeded.disk).filter((file) => file.endsWith(".vpk")).length,
        3,
      );
    } else if (phase === "recover-wipe") {
      await step(
        "observe startup after the entire profile folder was deleted",
        async () => {
          const notification = await $(
            '//*[@data-sonner-toast and contains(., "mods were removed because their files were deleted")]',
          );
          // Startup can finish and its transient toast expire before WDIO attaches.
          const visible = await notification.isDisplayed();
          const message = visible
            ? await notification.getText()
            : "No removed-mods notification visible when WDIO attached";
          if (visible)
            for (const modId of ALPHA_MODS) assert(message.includes(modId));
          await observeUntil(
            "Wiped mods removed from the library on startup",
            () => readBrokenState(world),
            (value) => value.state.localMods.length === 0,
          );
          const initial = await captureBrokenState(
            world,
            "wiped-startup",
            `${await $("main").getText()}\n${message}`,
          );
          await browser.saveScreenshot(
            path.join(world, "artifacts", "wiped-startup.png"),
          );
          assertRemovedBrokenState(initial);
          await expect($("main")).toHaveText(
            expect.stringContaining("No mods installed"),
          );
          assert.equal(
            await $$('main [role="switch"][aria-checked="true"]').length,
            0,
            "Removed mods must not have enabled switches",
          );
          for (const modId of ALPHA_MODS)
            assert.equal(
              await $$(`//main//*[normalize-space()="${modId}"]`).length,
              0,
            );
          await assertUntouchedBrokenNeighbours(world, initial);
          assert.equal(
            await $$('[data-sonner-toast][data-type="error"]').length,
            0,
            "Startup showed an error toast",
          );
        },
      );
      await browser.waitUntil(
        async () => (await $$("[data-sonner-toast]").length) === 0,
        {
          timeoutMsg:
            "Startup notifications did not clear before opening Tools",
        },
      );
      await openSettings("tools");
      await step(
        "Clear All Mods succeeds with the profile folder missing",
        async () => {
          const clear = await $("button=Clear All Mods");
          await reveal(clear);
          await clear.click();
          const dialog = await $('[role="alertdialog"]');
          await dialog.waitForDisplayed();
          await dialog.$("button=Clear All Mods").click();
          await expect(dialog).not.toBeDisplayed();
          await expect(
            $(
              '//*[@data-sonner-toast and contains(., "All mods have been cleared")]',
            ),
          ).toBeDisplayed();
          const cleared = await observeUntil(
            "Cleared library",
            () => readBrokenState(world),
            (value) => value.state.localMods.length === 0,
          );
          assertRemovedBrokenState(cleared);
          await assertUntouchedBrokenNeighbours(world, cleared);
          await captureBrokenState(world, "cleared");
        },
      );
      await navigate("mods");
      await $(`[title="${CATALOG_MOD_NAME}"]`).waitForDisplayed();
      await $(`[title="${CATALOG_MOD_NAME}"]`).click();
      await installCatalog(world, "gamebanana-single", ["base.vpk"]);
      await reinstallCatalog(world, true);
    }
    if (phase !== "seed-wipe") {
      if (phase === "restart-wipe")
        await waitForDisplayed(
          `//main//*[normalize-space()="${CATALOG_MOD_NAME}"]`,
        );
      const installed = await captureBrokenState(
        world,
        phase,
        await $("main").getText(),
      );
      assertReinstalledBrokenState(installed);
      await assertUntouchedBrokenNeighbours(world, installed);
      const downloads = await $('a[href="/downloads"]').getText();
      assert.doesNotMatch(
        downloads,
        /\d/,
        "A download remains queued after reinstall",
      );
    }
    await closeApplication(world, runtime.processId);
    const closed = await captureBrokenState(world, `closed-${phase}`);
    await assertUntouchedBrokenNeighbours(world, closed);
    if (phase === "seed-wipe") {
      await damageClosedWorld(world, "folder");
      const wiped = await captureBrokenState(world, "deleted-folder");
      assert.deepEqual(wiped.disk, {});
      assert.equal(wiped.manifest, null);
    } else assertReinstalledBrokenState(closed);
  });
});
