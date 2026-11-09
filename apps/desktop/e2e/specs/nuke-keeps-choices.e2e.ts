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
    const record: Record<string, object | string | null> = {};
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
    record.before = await settle(world, ORIGINAL_FILES);

    await step("Nuke & Reinstall", async () => {
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
      const summary = await dialog.$("p*=mods restored");
      await summary.waitForDisplayed({ timeout: 30_000 });
      record.summary = await summary.getText();
      await browser.keys("Escape");
      await waitForOverlaysClosed();
      await reinstalled(world);
    });
    record.afterNuke = await settle(world, ORIGINAL_FILES);
    record.alert = await alertStatus();

    await writeFile(
      path.join(world, "artifacts", "nuke-keeps-choices.json"),
      JSON.stringify(record, null, 2),
    );

    assert.deepEqual(record.before, ORIGINAL_FILES);
    assert.equal(record.summary, "1 of 1 mods restored.");
    assert.deepEqual(record.afterNuke, ORIGINAL_FILES);
    assert.equal(record.alert, "originalFiles");

    await closeApplication(world, runtime.processId);
  });
});
