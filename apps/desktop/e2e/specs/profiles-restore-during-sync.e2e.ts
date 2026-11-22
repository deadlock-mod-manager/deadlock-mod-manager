import { $, browser, expect } from "@wdio/globals";
import { z } from "zod";
import {
  startApplication,
  type ApplicationStatus,
} from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { holdEvents, releaseHeldEvents } from "../support/event-hold";
import { assertOwnedWorld } from "../support/world";
import { observeUntil } from "../support/observations";
import {
  holdNextIpcReply,
  ipcReplyDelivered,
  ipcReplyHeld,
  releaseHeldIpcReply,
} from "../support/ipc-hold";
import { ALPHA } from "../support/profile-fixtures";
import {
  LATE_METADATA_MOD_ID,
  RESTORE_BACKUP_ID,
  RESTORE_BACKUP_NAME,
} from "../support/profile-restore-fixtures";
import {
  assertRestoredVariant,
  readRestoreState,
} from "../support/profile-restore-oracle";

const lateLookupStarted = async (world: string) => {
  const { configuration } = await assertOwnedWorld(world);
  const response = await fetch(
    `${configuration.endpoints[0].origin}/__control/requests`,
  );
  const { requests } = z
    .object({ requests: z.array(z.looseObject({ url: z.string() })) })
    .parse(await response.json());
  return requests.some((request) =>
    request.url.startsWith(`/apiv11/Mod/${LATE_METADATA_MOD_ID}/ProfilePage`),
  );
};

describe("restoring a backup while startup syncs the profile", () => {
  it("keeps the backup's file picks after the sync finishes", async () => {
    const { roots } = await browser.execute(() =>
      // oxlint-disable-next-line no-underscore-dangle -- Tauri's injected IPC global.
      window.__TAURI_INTERNALS__.invoke<ApplicationStatus>("e2e_status"),
    );
    const world = roots.world;
    await browser.waitUntil(() => lateLookupStarted(world), {
      timeout: 8_000,
      timeoutMsg: "Startup never looked up the lost mod",
    });
    await holdNextIpcReply("get_profile_vpk_snapshot", ALPHA.folder);
    const runtime = await startApplication();
    await step("the startup sync is reading the active profile", () =>
      browser.waitUntil(ipcReplyHeld, {
        timeout: 30_000,
        timeoutMsg: "The startup sync never read the active profile",
      }),
    );

    await step("hold the addon watcher's reports", async () => {
      expect(await holdEvents("addons-vpks-changed")).toBeGreaterThan(0);
    });
    await step("restore the cloud backup into the active profile", async () => {
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
    });
    await observeUntil(
      "the restore was saved into the active profile",
      () => readRestoreState(world),
      (state) =>
        state.cloudBackupLinks[ALPHA.id]?.backupId === RESTORE_BACKUP_ID,
    );
    await step("the restore installed the backup's picks", () =>
      assertRestoredVariant(world, "before-sync-finished"),
    );

    await step("let the startup sync finish", async () => {
      await releaseHeldIpcReply();
      await browser.waitUntil(ipcReplyDelivered, {
        timeoutMsg: "The held sync reply was never delivered",
      });
      await browser.pause(5_000);
      await releaseHeldEvents();
      await browser.pause(5_000);
    });
    await step("the backup's picks are still there", () =>
      assertRestoredVariant(world, "after-sync-finished"),
    );
    await browser.keys("Escape");
    await closeApplication(world, runtime.processId);
    await assertRestoredVariant(world, "closed");
  });
});
