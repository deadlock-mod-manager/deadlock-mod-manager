import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { $, browser } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { fixAllInDialog, waitForStatus } from "../support/fixed-status";
import {
  alertStatus,
  openModPage,
  ORIGINAL_FILES,
  reinstalled,
  settle,
} from "../support/reinstall-choices";
import {
  CHOICES,
  REINSTALLED_MOD,
} from "../support/reinstall-choices-fixtures";
import { navigate, reveal, waitForOverlaysClosed } from "../support/ui";

describe("Nuke & Reinstall keeps the player's choices", () => {
  it("keeps the original-files choice and the load-order position", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");

    await step("fix the mod, then choose its original files", async () => {
      await waitForStatus(CHOICES.folder, REINSTALLED_MOD, "fixable");
      await fixAllInDialog();
      await waitForStatus(CHOICES.folder, REINSTALLED_MOD, "fixed");
      await browser.keys("Escape");
      await waitForOverlaysClosed();
      await openModPage();
      const alert = await $('[data-testid="mod-health-alert"]');
      await alert.waitForDisplayed();
      const original = await alert.$("button=Use original files");
      await reveal(original);
      await original.waitForClickable();
      await original.click();
      await waitForStatus(CHOICES.folder, REINSTALLED_MOD, "originalFiles");
    });
    const before = await settle(world, ORIGINAL_FILES);

    const summary = await step("Nuke & Reinstall", async () => {
      await navigate("my-mods");
      const menu = await $('button[aria-label="More actions"]');
      await menu.waitForClickable();
      await menu.click();
      await browser.keys("ArrowDown");
      await $(
        '//*[@role="menuitem" and normalize-space()="Nuke & Reinstall"]',
      ).click();
      const dialog = await $('[role="dialog"]');
      await dialog.waitForDisplayed();
      await dialog.$("button=Continue").click();
      await dialog.$("button=Nuke it").click();
      const restored = await dialog.$("p*=mods restored");
      await restored.waitForDisplayed({ timeout: 30_000 });
      const text = await restored.getText();
      await browser.keys("Escape");
      await waitForOverlaysClosed();
      await reinstalled(world);
      return text;
    });
    const afterNuke = await settle(world, ORIGINAL_FILES);
    const alert = await alertStatus();

    await writeFile(
      path.join(world, "artifacts", "nuke-keeps-choices.json"),
      JSON.stringify({ before, summary, afterNuke, alert }, null, 2),
    );

    assert.deepEqual(before, ORIGINAL_FILES);
    assert.equal(summary, "1 of 1 mods restored.");
    assert.deepEqual(afterNuke, ORIGINAL_FILES);
    assert.equal(alert, "originalFiles");

    await closeApplication(world, runtime.processId);
  });
});
