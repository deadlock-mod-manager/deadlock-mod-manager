import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { $, browser } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { fixAllInDialog, waitForStatus } from "../support/fixed-status";
import {
  FIXED,
  openModPage,
  reinstalled,
  settle,
} from "../support/reinstall-choices";
import {
  CHOICES,
  REINSTALLED_MOD,
} from "../support/reinstall-choices-fixtures";
import { setModEnabled } from "../support/shard-actions";
import { navigate, reveal, waitForOverlaysClosed } from "../support/ui";

describe("Reinstall keeps a disabled mod's choices", () => {
  it("keeps the fix and the load-order position for when it is enabled", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");

    await step("fix the mod", async () => {
      await waitForStatus(CHOICES.folder, REINSTALLED_MOD, "fixable");
      await fixAllInDialog();
      await waitForStatus(CHOICES.folder, REINSTALLED_MOD, "fixed");
      await browser.keys("Escape");
      await waitForOverlaysClosed();
    });
    const before = await settle(world, FIXED);
    await setModEnabled(world, REINSTALLED_MOD, false);

    await step("Reinstall the disabled mod from its page", async () => {
      await openModPage();
      const button = await $('button[aria-label="Reinstall"]');
      await reveal(button);
      await button.waitForClickable();
      await button.click();
      const dialog = await $('[role="alertdialog"]');
      await dialog.waitForDisplayed();
      await dialog.$("button=Reinstall").click();
      await dialog.waitForDisplayed({ reverse: true });
      await reinstalled(world, false);
    });

    await navigate("my-mods");
    await setModEnabled(world, REINSTALLED_MOD, true);
    const afterEnable = await settle(world, FIXED);

    await writeFile(
      path.join(world, "artifacts", "reinstall-disabled-keeps-choices.json"),
      JSON.stringify({ before, afterEnable }, null, 2),
    );

    assert.deepEqual(before, FIXED);
    assert.deepEqual(afterEnable, FIXED);

    await closeApplication(world, runtime.processId);
  });
});
