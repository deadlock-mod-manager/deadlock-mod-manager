import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import {
  analysisCard,
  readLibraryIds,
  RESTORE_METADATA_DELAY_MS,
} from "../support/analysis-library-status-fixtures";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { CATALOG_MOD_ID } from "../support/gamebanana-fixtures";
import { observeUntil } from "../support/observations";
import { ALPHA, BETA } from "../support/profile-fixtures";
import { openSettings } from "../support/settings-actions";
import {
  activateProfile,
  navigate,
  reveal,
  waitForDisplayed,
  waitForOverlaysClosed,
} from "../support/ui";

const INTERRUPTED = "restoring it was interrupted";

const startAnalysis = async () => {
  await navigate("my-mods");
  await waitForOverlaysClosed();
  // An empty library shows Analyze as a button; otherwise it is in the menu.
  if (await $("button=Analyze").isExisting()) {
    await $("button=Analyze").click();
  } else {
    await $('button[aria-label="More actions"]').click();
    await browser.keys("ArrowDown");
    await $('[role="menuitem"]=Analyze Local Addons').click();
  }
};

describe("Analyze after an interrupted restore from DMM's records", () => {
  it("lists the unrestored mod as not in the library, then restores it on retry", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");

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
        () => readLibraryIds(world, ALPHA.id),
        ({ active, profile }) => active.length === 0 && profile.length === 0,
      );
      await waitForOverlaysClosed();
    });

    await step(
      "analyze, then switch profiles while restoring waits",
      async () => {
        await startAnalysis();
        // Switching back to Alpha marks its library as changed, so the restore
        // Analyze started for Alpha is dropped when its mod page arrives.
        await activateProfile(BETA.name);
        await activateProfile(ALPHA.name);
      },
    );
    await step("analysis reports the interrupted restore", async () => {
      const error = `//div[@role="dialog"]//*[contains(normalize-space(), "${INTERRUPTED}")]`;
      await browser.waitUntil(async () => (await $(error)).isDisplayed(), {
        timeout: RESTORE_METADATA_DELAY_MS * 4,
        timeoutMsg: "Analysis never reported the interrupted restore",
      });
      const ids = await readLibraryIds(world, ALPHA.id);
      if (ids.profile.includes(CATALOG_MOD_ID))
        throw new Error("The restore was not interrupted");
    });

    await step("the card doesn't claim the mod was added", async () => {
      const card = analysisCard("pak01_dir.vpk");
      await waitForDisplayed(card);
      await browser.saveScreenshot(
        path.join(world, "artifacts", "interrupted-restore.png"),
      );
      await expect($(card)).toHaveText(
        expect.stringContaining("Not in Library"),
      );
      await expect($(card)).not.toHaveText(
        expect.stringContaining("Added to Library"),
      );
      await browser.keys("Escape");
      await waitForOverlaysClosed();
    });

    await step("analyzing again restores the mod", async () => {
      await startAnalysis();
      await observeUntil(
        "mod restored from DMM's records",
        () => readLibraryIds(world, ALPHA.id),
        ({ active, profile }) =>
          active.includes(CATALOG_MOD_ID) && profile.includes(CATALOG_MOD_ID),
        RESTORE_METADATA_DELAY_MS * 4,
      );
    });

    await closeApplication(world, runtime.processId);
  });
});
