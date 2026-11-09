import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { $, browser } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import {
  badgeStatus,
  fixAllInDialog,
  waitForStatus,
} from "../support/fixed-status";
import {
  FIXED,
  observe,
  openModPage,
  reinstalled,
  settle,
} from "../support/reinstall-choices";
import {
  CHOICES,
  LOAD_ORDER,
  REINSTALLED_MOD,
} from "../support/reinstall-choices-fixtures";
import { setModEnabled } from "../support/shard-actions";
import { navigate, reveal, waitForOverlaysClosed } from "../support/ui";

describe("Reinstall keeps the player's choices", () => {
  it("keeps the fix and the load-order position", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const record: Record<string, object | string | null> = {};
    await navigate("my-mods");

    await step("fix the mod", async () => {
      await waitForStatus(CHOICES.folder, REINSTALLED_MOD, "fixable");
      await fixAllInDialog();
      await waitForStatus(CHOICES.folder, REINSTALLED_MOD, "fixed");
      await browser.keys("Escape");
      await waitForOverlaysClosed();
    });
    record.before = await settle(world, FIXED);

    await step("Reinstall the mod from its page", async () => {
      await openModPage();
      const button = await $('button[aria-label="Reinstall"]');
      await reveal(button);
      await button.waitForClickable();
      await button.click();
      const dialog = await $('[role="alertdialog"]');
      await dialog.waitForDisplayed();
      await dialog.$("button=Reinstall").click();
      await dialog.waitForDisplayed({ reverse: true });
      await reinstalled(world);
    });
    record.afterReinstall = await settle(world, FIXED);
    record.badge = await badgeStatus(REINSTALLED_MOD);

    // Turning another mod off and on reorders the profile by saved position.
    await setModEnabled(world, LOAD_ORDER[2], false);
    await setModEnabled(world, LOAD_ORDER[2], true);
    record.afterReorder = await observe(world);

    await writeFile(
      path.join(world, "artifacts", "reinstall-keeps-choices.json"),
      JSON.stringify(record, null, 2),
    );

    assert.deepEqual(record.before, FIXED);
    assert.deepEqual(record.afterReinstall, FIXED);
    assert.equal(record.badge, "fixed");
    assert.deepEqual(record.afterReorder, FIXED);

    await closeApplication(world, runtime.processId);
  });
});
