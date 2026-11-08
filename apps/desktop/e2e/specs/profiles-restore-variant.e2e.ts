import { $, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { observeUntil } from "../support/observations";
import { ALPHA } from "../support/profile-fixtures";
import {
  RESTORE_BACKUP_ID,
  RESTORE_BACKUP_NAME,
} from "../support/profile-restore-fixtures";
import {
  assertPreviousVariant,
  assertRestoredVariant,
  readRestoreState,
} from "../support/profile-restore-oracle";
import { navigate } from "../support/ui";

describe("restoring a different mod variant", () => {
  it("replaces the active profile's old variant and keeps only the backup's files", async () => {
    const phase = z
      .enum(["restore-variant", "restart-restored-variant"])
      .parse(process.env.DMM_E2E_PHASE);
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");
    if (phase === "restore-variant") {
      await step("the active profile holds the old and parked variants", () =>
        assertPreviousVariant(world),
      );
      await step(
        "restore the cloud backup into the active profile",
        async () => {
          await $('button[aria-label="Active Profile"]').click();
          await $('[role="tab"][id$="-trigger-cloud"]').click();
          await $("button=Restore").waitForClickable();
          await $("button=Restore").click();
          const dialog = $(
            `//*[@role="dialog"][.//*[normalize-space()="Restore ${RESTORE_BACKUP_NAME}?"]]`,
          );
          await dialog.waitForDisplayed();
          await dialog.$('label[for="restore-replace"]').click();
          const restore = dialog.$("button=Restore 3 mods");
          await restore.waitForClickable({ timeout: 30_000 });
          await restore.click();
          await expect(dialog).not.toBeDisplayed({ wait: 60_000 });
        },
      );
      await observeUntil(
        "the replacement was saved into the active profile",
        () => readRestoreState(world),
        (state) =>
          state.cloudBackupLinks[ALPHA.id]?.backupId === RESTORE_BACKUP_ID,
      );
      await step("only the restored variants remain", () =>
        assertRestoredVariant(world, "restored"),
      );
      await browser.keys("Escape");
    } else {
      await step("a fresh process keeps the restored variants", () =>
        assertRestoredVariant(world, "restarted"),
      );
    }
    await closeApplication(world, runtime.processId);
    await assertRestoredVariant(world, `closed-${phase}`);
  });
});
